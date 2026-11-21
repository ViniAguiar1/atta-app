import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { cpfHmac, isValidCpf, isValidRne, maskCpf, maskRne, normalizeCpf, normalizeRne, rneHmac } from "@/server/crypto/cpf";
import { normalizeEmail } from "@/server/crypto/email";
import { abrirContato, paraBytea, selarColunas } from "./contato";
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
  archived_at: z.string().nullable().optional(),
});

type ArgsDoCadastro = Database["api"]["Functions"]["patient_register"]["Args"];

// api.patient_lookup_by_cpf e api.patient_link_by_cpf (#150 do Backend 2): jsonb com status
const consultaSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("nao_encontrado") }),
  z.object({ status: z.literal("ja_paciente"), person_id: z.uuid() }),
  z.object({
    status: z.literal("na_rede"),
    card: z.object({
      person_id: z.uuid(),
      full_name: z.string().min(1),
      social_name: z.string().nullable(),
      birth_date: z.string().nullable(),
      cpf_masked: z.string().nullable(),
      is_incomplete: z.boolean(),
      is_verified: z.boolean(),
      verified_until: z.string().nullable(),
      phone_enc: z.string().nullable(),
      email_enc: z.string().nullable(),
      envelope_id: z.uuid().nullable(),
      dek_wrapped: z.string().nullable(),
      kek_version: z.number().int().nullable(),
      health_forms_count: z.number().int().nonnegative(),
    }),
  }),
]);

const vinculoSchema = z.object({
  status: z.enum(["vinculado", "nao_encontrado", "ja_paciente"]),
  person_id: z.uuid().nullable(),
  network_access: z.string().nullable(),
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

/**
 * "11987654321" → "(11) ·····-4321": só o DDD e os 4 últimos dígitos (PDD §19.8). Fora de 10 ou 11 dígitos (+55…, curto,
 * texto), só os 4 últimos dígitos ("·····-4321") ou "···": a máscara nunca cai no valor cru (Tech Lead, #91).
 */
export function celularMascarado(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  if (d.length === 11 || d.length === 10) {
    const meio = d.length - 6;
    return `(${d.slice(0, 2)}) ${PONTO.repeat(meio)}-${d.slice(-4)}`;
  }
  return d.length >= 4 ? `${PONTO.repeat(5)}-${d.slice(-4)}` : PONTO.repeat(3);
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
    // selo válido → "Com selo"; selo vencido (verified_until no passado, is_verified falso; #158) → "Selo expirado";
    // em pending o banco não devolve nada da rede, nem o selo
    selo: r.is_verified ? "com_selo" : r.verified_until ? "selo_expirado" : null,
    identificacao: identificacaoDe(r.cpf_masked, r.foreign_doc_masked),
    nascimento: r.birth_date,
    contato: celular || email ? { celular, email } : null,
    atendimento: null, // last_appointment vem nulo até a agenda (MIG-11); o formato fecha com ela
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
        seloExpirouEm: !f.is_verified && f.verified_until ? f.verified_until : null,
        arquivadoEm: f.archived_at ?? null,
        origem: f.origin,
        vinculadoEm: f.linked_at,
        acessoARede: f.network_access === "pending" ? "pendente" : f.network_access === "granted" ? "autorizado" : "proprio",
      });
    } catch {
      return malFormado("pacientes.contato_nao_abriu");
    }
  },

  async consultarCpf(cpf) {
    const normal = normalizeCpf(cpf);
    if (!normal || !isValidCpf(normal)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
    const { api } = await contexto();
    let hmac: string;
    try {
      hmac = paraBytea(cpfHmac(normal));
    } catch {
      return malFormado("pacientes.hmac_indisponivel");
    }
    const { data, error } = await api.rpc("patient_lookup_by_cpf", { p_cpf_hmac: hmac });
    if (error) return falhaDoBanco(error);
    const lido = consultaSchema.safeParse(data);
    if (!lido.success) return malFormado("pacientes.consulta_fora_do_formato");
    const r = lido.data;
    if (r.status === "nao_encontrado") return ok({ situacao: "nao_encontrado" });
    if (r.status === "ja_paciente") return ok({ situacao: "ja_paciente", id: r.person_id });
    const c = r.card;
    try {
      // o cartão é da pessoa da rede (network.person, tenant ''): abre aqui e só sai mascarado (Segurança, #150)
      const contato = await abrirContato({ ...c, network_access: "granted" }, "");
      const celular = celularMascarado(contato.celular);
      const email = emailMascarado(contato.email);
      return ok({
        situacao: "na_rede",
        cartao: {
          id: c.person_id,
          nome: c.social_name ?? c.full_name,
          nomeCivil: c.full_name,
          nomeSocial: c.social_name,
          nascimento: c.birth_date,
          identificacao: identificacaoDe(c.cpf_masked, null),
          incompleto: c.is_incomplete,
          contato: celular || email ? { celular, email } : null,
          selo: c.is_verified && c.verified_until ? { validoAte: c.verified_until } : null,
          respostasDeSaude: c.health_forms_count,
        },
      });
    } catch {
      return malFormado("pacientes.contato_nao_abriu");
    }
  },

  async vincularPorCpf(cpf) {
    const normal = normalizeCpf(cpf);
    if (!normal || !isValidCpf(normal)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
    const { api } = await contexto();
    let hmac: string;
    try {
      hmac = paraBytea(cpfHmac(normal));
    } catch {
      return malFormado("pacientes.hmac_indisponivel");
    }
    const { data, error } = await api.rpc("patient_link_by_cpf", { p_cpf_hmac: hmac });
    if (error) return falhaDoBanco(error);
    const lido = vinculoSchema.safeParse(data);
    if (!lido.success) return malFormado("pacientes.vinculo_fora_do_formato");
    const v = lido.data;
    if (v.status === "nao_encontrado" || !v.person_id) return falha("NAO_ENCONTRADO", "CPF fora da rede.");
    return ok({ id: v.person_id, situacao: v.status });
  },

  async cadastrar(dados) {
    const { api, tenantId } = await contexto();
    if (!tenantId) return falha("NAO_AUTENTICADO", "Sem clínica na sessão.");
    const id = crypto.randomUUID(); // gerado aqui: entra na AAD do envelope (ADR 0002 §6)
    const doc = dados.documento;
    const args: ArgsDoCadastro = {
      p_id: id,
      p_full_name: dados.nomeCivil,
      p_social_name: dados.nomeSocial ?? undefined,
      p_birth_date: dados.nascimento ?? undefined,
      p_is_incomplete: doc.tipo !== "cpf", // sem CPF, o cadastro fica marcado como incompleto (RN-PAC-02)
    };
    const segredos: Record<"phone_enc" | "email_enc" | "cpf_enc" | "foreign_doc_enc", string | null> = {
      phone_enc: dados.celular ? dados.celular.replace(/\D/g, "") : null,
      email_enc: dados.email ? normalizeEmail(dados.email) : null,
      cpf_enc: null,
      foreign_doc_enc: null,
    };
    try {
      if (doc.tipo === "cpf") {
        const cpf = normalizeCpf(doc.numero);
        if (!cpf || !isValidCpf(cpf)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
        args.p_cpf_hmac = paraBytea(cpfHmac(cpf));
        args.p_cpf_masked = maskCpf(cpf);
        segredos.cpf_enc = cpf;
      } else if (doc.tipo === "estrangeiro") {
        const rne = normalizeRne(doc.numero);
        if (!rne || !isValidRne(rne)) return falha("VALIDACAO", "RNE inválido.", [{ campo: "rne", code: "VALIDACAO" }]);
        args.p_foreign_doc_type = doc.especie;
        args.p_foreign_doc_hmac = paraBytea(rneHmac(rne));
        args.p_foreign_doc_masked = maskRne(rne);
        segredos.foreign_doc_enc = rne;
      }
      // um envelope só para a linha: documento e contato com a mesma DEK, cada um com a AAD da sua coluna
      const envelope = await selarColunas(segredos, { tenant: "", tabela: "network.person" }, id);
      args.p_cpf_enc = envelope.colunas.cpf_enc;
      args.p_foreign_doc_enc = envelope.colunas.foreign_doc_enc;
      args.p_phone_enc = envelope.colunas.phone_enc;
      args.p_email_enc = envelope.colunas.email_enc;
      args.p_dek_wrapped = envelope.dek_wrapped ?? undefined;
      args.p_kek_version = envelope.kek_version ?? undefined;
    } catch {
      return malFormado("pacientes.cifra_indisponivel"); // pepper ou chave ausente: INTERNO, sem dado no log
    }
    const { data, error } = await api.rpc("patient_register", args);
    if (error) return falhaDoBanco(error);
    const lido = z.array(z.object({ person_id: z.uuid(), reused: z.boolean() })).length(1).safeParse(data);
    if (!lido.success) return malFormado("pacientes.cadastro_fora_do_formato");
    return ok({ id: lido.data[0]!.person_id, reaproveitado: lido.data[0]!.reused });
  },
  async atualizar() {
    return falha("INDISPONIVEL", "Edição ainda não ligada.");
  },

  async reportarDivergenciaPorCpf(cpf, motivo) {
    const normal = normalizeCpf(cpf);
    if (!normal || !isValidCpf(normal)) return falha("VALIDACAO", "CPF inválido.", [{ campo: "cpf", code: "VALIDACAO" }]);
    const { api } = await contexto();
    let hmac: string;
    try {
      hmac = paraBytea(cpfHmac(normal));
    } catch {
      return malFormado("pacientes.hmac_indisponivel");
    }
    // api.report_divergence_by_cpf (#171 do Backend 2): sempre { status: 'recebido' }, sem revelar se o CPF está na rede
    const { data, error } = await api.rpc("report_divergence_by_cpf", { p_cpf_hmac: hmac, p_reason: motivo });
    if (error) return falhaDoBanco(error);
    const lido = z.object({ status: z.literal("recebido") }).safeParse(data);
    return lido.success ? ok({ recebido: true as const }) : malFormado("pacientes.reporte_fora_do_formato");
  },

  async arquivar(id, arquivado) {
    const { api } = await contexto();
    const { data, error } = await api.rpc("patient_set_archived", { p_person_id: id, p_archived: arquivado });
    if (error) return falhaDoBanco(error);
    const lido = z.object({ person_id: z.uuid(), archived: z.boolean() }).safeParse(data);
    return lido.success ? ok({ arquivado: lido.data.archived }) : malFormado("pacientes.arquivo_fora_do_formato");
  },

  async reportarDivergencia(id, motivo) {
    const { api } = await contexto();
    const { data, error } = await api.rpc("report_divergence", { p_person_id: id, p_reason: motivo });
    if (error) return falhaDoBanco(error);
    const lido = z.uuid().safeParse(data);
    return lido.success ? ok({ protocolo: lido.data }) : malFormado("pacientes.divergencia_fora_do_formato");
  },
};
