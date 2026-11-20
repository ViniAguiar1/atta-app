import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cpfHmac, isValidCpf, normalizeCpf } from "@/server/crypto/cpf";
import { abrirContato, paraBytea } from "./contato";
import type { Identificacao, LinhaDePaciente, PortaPacientes } from "./porta";

// Porta real de Pacientes (MIG-43) sobre o api.patient_* do MIG-12 (#12, #19). Cliente de servidor com a sessão do
// usuário, nunca a secret key: tenant, permissão (has_permission('patients', …)) e auditoria são conferidos no banco.
// A resposta passa pelo Zod antes de virar linha de tela; o erro do banco vira Resultado por falhaDoBanco, com o
// reason. O CPF da busca vira HMAC aqui (ATTA_CPF_PEPPER) e nunca vai ao banco, à URL nem ao log; os contatos chegam
// cifrados e são abertos aqui (contato.ts).
//
// Forma das linhas: a do #90 do Backend 2 (lista e busca com as mesmas colunas). O último atendimento vem nulo até a
// agenda (MIG-11) e os documentos vêm [] até o schema documents: o formato dos dois fecha com esses itens, e até lá a
// tela mostra "Nenhum atendimento aqui" e "Nenhum documento".
// Contato (PDD v206 §19.8, "exibição parcial de dados identificadores quando suficiente"; pedido da Segurança): a lista
// recebe celular e e-mail já mascarados aqui no servidor; o inteiro fica na Pasta do Paciente, cuja abertura é leitura
// auditada. O navegador nunca recebe o contato inteiro pela lista nem pela busca.

const POR_PAGINA = 50;

const bytea = z.string().nullable();

const linhaSchema = z.object({
  person_id: z.uuid(),
  display_name: z.string().min(1),
  display_is_social: z.boolean(),
  cpf_masked: z.string().nullable(),
  foreign_doc_masked: z.string().nullable(),
  birth_date: z.string().nullable(),
  is_incomplete: z.boolean(),
  is_verified: z.boolean(),
  verified_until: z.string().nullable(),
  phone_enc: bytea,
  email_enc: bytea,
  envelope_id: z.uuid().nullable(),
  dek_wrapped: bytea,
  kek_version: z.number().int().nullable(),
  network_access: z.string(),
  linked_at: z.string(),
  last_appointment: z.unknown().nullable(), // nulo até o MIG-11
  documents: z.array(z.unknown()), // [] até o schema documents
  total_active: z.number().int().nonnegative(),
});

const fichaSchema = z.object({
  person_id: z.uuid(),
  cpf_masked: z.string().nullable(),
  foreign_doc_masked: z.string().nullable(),
  phone_enc: bytea,
  email_enc: bytea,
  dek_wrapped: bytea,
  kek_version: z.number().int().nullable(),
  linked_at: z.string(),
  network_access: z.string(),
  envelope_id: z.uuid().nullable(),
  full_name: z.string().min(1),
  social_name: z.string().nullable(),
  birth_date: z.string().nullable(),
  foreign_doc_type: z.string().nullable(),
  is_incomplete: z.boolean(),
  is_verified: z.boolean(),
  verified_until: z.string().nullable(),
  origin: z.enum(["recepcao", "atta_me", "importacao"]),
});

const identificacaoDe = (cpf: string | null, estrangeiro: string | null): Identificacao =>
  cpf ? { tipo: "cpf", mascarado: cpf } : estrangeiro ? { tipo: "estrangeiro", mascarado: estrangeiro } : { tipo: "incompleto" };

/** "11987654321" → "(11) 98765-4321"; o que não tiver 10 ou 11 dígitos vai como veio. */
export function celularParaTela(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

const PONTO = "\u00b7"; // o ponto médio da máscara única (ADR 0002 §6)

/** "11987654321" → "(11) ·····-4321": só o DDD e os 4 últimos dígitos (PDD §19.8). */
export function celularMascarado(valor: string | null): string | null {
  const tela = celularParaTela(valor);
  if (!tela) return null;
  return tela.replace(/(\(\d{2}\) )(\d{4,5})-(\d{4})$/, (_, ddd: string, meio: string, fim: string) => `${ddd}${PONTO.repeat(meio.length)}-${fim}`);
}

/** "juliana.prates@exemplo.test" → "ju···@exemplo.test": as 2 primeiras letras e o domínio (PDD §19.8). */
export function emailMascarado(valor: string | null): string | null {
  if (!valor) return null;
  const arroba = valor.lastIndexOf("@");
  if (arroba < 1) return PONTO.repeat(3);
  return `${valor.slice(0, Math.min(2, arroba))}${PONTO.repeat(3)}${valor.slice(arroba)}`;
}

async function contexto() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const tenantId = typeof data?.claims?.tenant_id === "string" ? data.claims.tenant_id : null;
  return { api: supabase.schema("api"), tenantId };
}

function malFormado(evento: string): Resultado<never> {
  logger.error(evento, { code: "INTERNO" }); // sem a resposta: ela tem nome e contato
  return falha("INTERNO", "Resposta fora do formato.");
}

async function paraLinha(r: z.infer<typeof linhaSchema>, tenantId: string): Promise<LinhaDePaciente> {
  const contato = await abrirContato(r, tenantId);
  const celular = celularMascarado(contato.celular);
  const email = emailMascarado(contato.email);
  return {
    id: r.person_id,
    nome: r.display_name,
    usaNomeSocial: r.display_is_social,
    incompleto: r.is_incomplete,
    identificacao: identificacaoDe(r.cpf_masked, r.foreign_doc_masked),
    nascimento: r.birth_date,
    contato: celular || email ? { celular, email } : null,
    ultimoAtendimento: null, // o formato fecha com o MIG-11; até lá a função devolve nulo
    documentos: [], // idem, com o schema documents
  };
}

async function paraLinhas(dados: unknown, tenantId: string, evento: string) {
  const lido = z.array(linhaSchema).safeParse(dados);
  if (!lido.success) return { erro: malFormado(`${evento}_fora_do_formato`) };
  try {
    return { linhas: lido.data, itens: await Promise.all(lido.data.map((r) => paraLinha(r, tenantId))) };
  } catch {
    return { erro: malFormado("pacientes.contato_nao_abriu") };
  }
}

export const portaPacientesReal: PortaPacientes = {
  async listar(apos) {
    const { api, tenantId } = await contexto();
    if (!tenantId) return falha("NAO_AUTENTICADO", "Sem clínica na sessão.");
    const { data, error } = await api.rpc("patient_list", {
      p_limit: POR_PAGINA,
      ...(apos ? { p_after_name: apos.nome, p_after_id: apos.id } : {}),
    });
    if (error) return falhaDoBanco(error);
    const r = await paraLinhas(data, tenantId, "pacientes.lista");
    if ("erro" in r) return r.erro!;
    const ultimo = r.linhas.at(-1);
    const proxima = r.linhas.length === POR_PAGINA && ultimo ? { nome: ultimo.display_name, id: ultimo.person_id } : null;
    return ok({ itens: r.itens, proxima, total: r.linhas[0]?.total_active ?? 0 });
  },

  async buscar(termo) {
    const { api, tenantId } = await contexto();
    if (!tenantId) return falha("NAO_AUTENTICADO", "Sem clínica na sessão.");
    const cpf = normalizeCpf(termo);
    const porCpf = cpf !== null && isValidCpf(cpf);
    if (!porCpf && (termo.trim().length < 2 || /^[\d.\-\s/]+$/.test(termo.trim()))) {
      return falha("VALIDACAO", "Busca curta.", [{ campo: "termo", code: "VALIDACAO" }]);
    }
    let filtro: { p_doc_hmac: string } | { p_name: string };
    try {
      filtro = porCpf ? { p_doc_hmac: paraBytea(cpfHmac(cpf)) } : { p_name: termo.trim() };
    } catch {
      return malFormado("pacientes.hmac_indisponivel"); // pepper ausente ou recusado: INTERNO, sem o termo no log
    }
    const { data, error } = await api.rpc("patient_search", filtro);
    if (error) return falhaDoBanco(error);
    const r = await paraLinhas(data, tenantId, "pacientes.busca");
    return "erro" in r ? r.erro! : ok(r.itens);
  },

  async obter(id) {
    const { api, tenantId } = await contexto();
    if (!tenantId) return falha("NAO_AUTENTICADO", "Sem clínica na sessão.");
    const { data, error } = await api.rpc("patient_get", { p_person_id: id });
    if (error) return falhaDoBanco(error);
    const lido = z.array(fichaSchema).length(1).safeParse(data);
    if (!lido.success) return malFormado("pacientes.ficha_fora_do_formato");
    const f = lido.data[0]!;
    try {
      const contato = await abrirContato(f, tenantId);
      return ok({
        id: f.person_id,
        nome: f.social_name ?? f.full_name,
        nomeCivil: f.full_name,
        nomeSocial: f.social_name,
        nascimento: f.birth_date,
        identificacao: identificacaoDe(f.cpf_masked, f.foreign_doc_masked),
        contato: contato.celular || contato.email ? { celular: celularParaTela(contato.celular), email: contato.email } : null,
        selo: f.is_verified && f.verified_until ? { validoAte: f.verified_until } : null,
        origem: f.origin,
        vinculadoEm: f.linked_at,
        acessoARede: f.network_access === "pending" ? "pendente" : f.network_access === "granted" ? "autorizado" : "proprio",
      });
    } catch {
      return malFormado("pacientes.contato_nao_abriu");
    }
  },

  // O cadastro e a edição chegam com o MIG-12d (patient_lookup_by_cpf e patient_link_by_cpf; PDD §10.1, decisão do
  // dono de 20/11) e com as telas deles. Nenhuma tela chama estes dois ainda.
  async cadastrar() {
    return falha("INDISPONIVEL", "Cadastro ainda não ligado.");
  },
  async atualizar() {
    return falha("INDISPONIVEL", "Edição ainda não ligada.");
  },

  async reportarDivergencia(id, motivo) {
    const { api } = await contexto();
    const { data, error } = await api.rpc("report_divergence", { p_person_id: id, p_reason: motivo });
    if (error) return falhaDoBanco(error);
    const lido = z.uuid().safeParse(data);
    return lido.success ? ok({ protocolo: lido.data }) : malFormado("pacientes.divergencia_fora_do_formato");
  },
};
