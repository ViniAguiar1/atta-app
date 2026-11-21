import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type ErroDoBanco, type Resultado } from "@/lib/errors";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  assinarTermoDeAutorizacao,
  dadosDoContexto,
  type ContextoDoTermo,
  type PacoteDoTermo,
} from "@/server/atta-sign/termo-autorizacao";
import { estadoDoConselhoParaOBanco, portaConselho, type PortaConselho } from "@/server/conselho/porta";
import { cpfHmac } from "@/server/crypto/cpf";
import { gerarSegredo, hashDoSegredo } from "@/server/grant/politica";
import { consumirLimite, LIMITES } from "@/server/limite";
import { pinMac, PIN_MAC_VERSION, validarPin } from "@/server/pin/pin";
import { abrirConvite, selarProfissional } from "./convite";

// Servidor do PROpass (MIG-14b; PDD v206 §10.4.3; ADR 0001 §1 e ADR 0004): o que a porta real do Frontend 6 chama, na
// ordem da tela. O profissional não tem login: tudo sai do link (o sha256 do segredo, do cookie), nunca de um id do
// navegador. Nada de CPF, e-mail, telefone, PIN ou texto do banco em log ou na resposta.
//   - conferirIdentidade (passo 2): 'pedir_pin' | 'usar_pin_existente', sem oráculo de CPF (Tech Lead, 21/11);
//   - enviarPropass (envio final): limite, convite, conselho, identidade, cifra, PIN, ATTA Sign e o api.propass_submit.
// O contexto do Termo (api.propass_authorization_context), o dadosDoContexto e o preencherTermo do passo 3 são do
// Backend 3 (ADR 0001, "Dados da clínica e texto do Termo"); o envio só usa os dois primeiros, para o pacote.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: ErroDoBanco | null }>;
const rpcAdmin: Rpc = (fn, args) =>
  (criarClienteAdmin().schema("api") as unknown as { rpc: Rpc }).rpc(fn, args);

const bytea = (b: Uint8Array) => `\\x${Buffer.from(b).toString("hex")}`;
const LINK_SEM_VALIDADE: Resultado<never> = falha("NAO_ENCONTRADO", MENSAGENS.NAO_ENCONTRADO);

/** Link desconhecido, vencido, revogado ou de vínculo excluído: a mesma resposta (NAO_ENCONTRADO). */
function erroDoBanco(e: ErroDoBanco): Resultado<never> {
  if (e.code === "42501") return LINK_SEM_VALIDADE;
  return falhaDoBanco(e);
}

export type Origem = { ip: string | null; userAgent: string | null };

/**
 * Clínica e modelo pelo link (api.propass_authorization_context e dadosDoContexto, do Backend 3; ADR 0001, "Dados da
 * clínica e texto do Termo"): os mesmos valores do texto que o preencherTermo mostra no passo 3. Sem razão social ou sem
 * CNPJ, a própria função recusa (ATTA-IN-0003, legal_name ou cnpj) e nada é montado nem assinado.
 */
async function contextoDoTermo(hashDoLink: Buffer, rpc: Rpc): Promise<Resultado<ReturnType<typeof dadosDoContexto>>> {
  const { data, error } = await rpc("propass_authorization_context", { p_secret_hash: bytea(hashDoLink) });
  if (error) return erroDoBanco(error);
  const l = (Array.isArray(data) ? data[0] : data) as ContextoDoTermo | undefined;
  if (!l) return LINK_SEM_VALIDADE;
  if (!l.legal_name || !l.cnpj) return falha("CONFLITO", MENSAGENS.CONFLITO, undefined, "ATTA-IN-0003:legal_name");
  return ok(dadosDoContexto(l));
}

export type DependenciasDoEnvio = {
  rpc?: Rpc;
  conselho?: PortaConselho;
  limite?: (ip: string | null) => Promise<Resultado<null>>;
  abrir?: typeof abrirConvite;
  selar?: typeof selarProfissional;
  hmacDoCpf?: (cpf: string) => Buffer;
  macDoPin?: (professionalId: string, pin: string) => Buffer;
  assinar?: (dados: Parameters<typeof assinarTermoDeAutorizacao>[0]) => Promise<PacoteDoTermo>;
  novoId?: () => string;
  /** O segredo do download dos PDFs (testes); o padrão é o gerarSegredo. */
  segredoDoDownload?: () => string;
};

const limitePadrao = (ip: string | null) => consumirLimite(LIMITES.propassEnvioPorIp, ip);

/**
 * Do banco ao servidor, validado (o id entra no pin_mac; Tech Lead no #247). O professional_id só vem no existente sem
 * PIN e nunca sai deste arquivo.
 */
const identidadeSchema = z.object({
  status: z.enum(["pedir_pin", "usar_pin_existente"]),
  professional_id: z.uuid().nullable().optional(),
});
type Identidade = z.infer<typeof identidadeSchema>;

async function identidade(
  hashDoLink: Buffer,
  r: { conselho: string; uf: string; numero: string; cpf: string },
  d: DependenciasDoEnvio,
): Promise<Resultado<Identidade>> {
  const { data, error } = await (d.rpc ?? rpcAdmin)("propass_identity_check", {
    p_secret_hash: bytea(hashDoLink),
    p_council: r.conselho,
    p_council_uf: r.uf,
    p_council_number: r.numero,
    p_cpf_hmac: bytea((d.hmacDoCpf ?? cpfHmac)(r.cpf.replace(/\D/g, ""))),
  });
  if (error) return erroDoBanco(error);
  const lida = identidadeSchema.safeParse(data);
  return lida.success ? ok(lida.data) : falha("INTERNO", MENSAGENS.INTERNO);
}

/**
 * Passo 2: pede a senha ou diz que o profissional usa a que já tem. Só duas respostas, sem distinguir "não existe" de
 * "não confere" (sem oráculo de CPF); a recusa de verdade é do envio, contada no link. Limite por IP antes.
 */
export async function conferirIdentidade(
  hashDoLink: Buffer,
  r: { conselho: string; uf: string; numero: string; cpf: string },
  origem: Origem,
  d: DependenciasDoEnvio = {},
): Promise<Resultado<{ status: Identidade["status"] }>> {
  const limite = await (d.limite ?? limitePadrao)(origem.ip);
  if (!limite.ok) return limite;
  const id = await identidade(hashDoLink, r, d);
  return id.ok ? ok({ status: id.data.status }) : id;
}

export type EntradaDoEnvio = {
  dados: { nome: string; cpf: string; whatsapp: string; conselho: string; numero: string; uf: string };
  assinaturaPng: Uint8Array;
  /** Obrigatório quando o passo 2 disse 'pedir_pin'; ausente quando disse 'usar_pin_existente'. */
  pin?: string | null;
  leitura: { abertoEm: Date; rolagemCompletaEm: Date };
  origem: Origem;
  /** Versão do Aviso de Privacidade do Profissional que ele confirmou ter lido; null enquanto o passo estiver desligado
   *  (P2b, decisão do CTO). Quem exige ou não é a action (Frontend 6); aqui só se repassa ao banco. */
  avisoDePrivacidade?: string | null;
};

/** 'ok' traz o Código ATTA do Termo de Autorização gravado; 'recusado' é a recusa genérica de identidade. */
export type ResultadoDoEnvio = { status: "ok"; codigoAtta: string; segredoDoDownload: string } | { status: "recusado" };

/**
 * Envio final (api.propass_submit, #208): tudo ou nada no banco. A conferência do conselho é refeita aqui, na mesma
 * requisição (Segurança, #129); "não confere" sai sem chamar o banco. A recusa de identidade volta como 'recusado'.
 */
export async function enviarPropass(
  hashDoLink: Buffer,
  e: EntradaDoEnvio,
  d: DependenciasDoEnvio = {},
): Promise<Resultado<ResultadoDoEnvio>> {
  const rpc = d.rpc ?? rpcAdmin;
  const limite = await (d.limite ?? limitePadrao)(e.origem.ip);
  if (!limite.ok) return limite;
  // um nome com "{{" ou "}}" travaria o preencherTermo (que recusa marcador sobrando): campo inválido, sem tocar no banco
  // (Segurança, revisão do #240; o Zod do passo 1 repete a regra na tela)
  if (/\{\{|\}\}/.test(e.dados.nome)) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "nome", code: "VALIDACAO" }]);
  const campoPin = (motivo: string) =>
    falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "pin", code: "VALIDACAO" }], `ATTA-IN-0001:pin_${motivo}`);
  const pinDigitado = e.pin ?? null;
  if (pinDigitado !== null) {
    const v = validarPin(pinDigitado);
    if (!v.ok) return campoPin(v.motivo);
  }

  // 1. o convite (o e-mail travado sai daqui, nunca do navegador) e o contexto do termo
  const { data: conv, error: erroConv } = await rpc("propass_resolve", { p_secret_hash: bytea(hashDoLink) });
  if (erroConv) return erroDoBanco(erroConv);
  const linha = (Array.isArray(conv) ? conv[0] : conv) as Record<string, string | number> | undefined;
  if (!linha) return LINK_SEM_VALIDADE;
  const email = await (d.abrir ?? abrirConvite)({
    tenant_id: String(linha.tenant_id),
    invite_email_enc: String(linha.invite_email_enc),
    invite_envelope_id: String(linha.invite_envelope_id),
    invite_dek_wrapped: String(linha.invite_dek_wrapped),
    invite_kek_version: Number(linha.invite_kek_version),
  });
  const ctx = await contextoDoTermo(hashDoLink, rpc);
  if (!ctx.ok) return ctx;

  // 2. conselho, na mesma requisição
  const r = { conselho: e.dados.conselho, uf: e.dados.uf, numero: e.dados.numero, cpf: e.dados.cpf };
  const situacao = await (d.conselho ?? portaConselho).conferir({ conselho: r.conselho as never, uf: r.uf, numero: r.numero, nome: e.dados.nome });
  const estado = estadoDoConselhoParaOBanco(situacao);
  if (!estado) return falha("CONFLITO", MENSAGENS.CONFLITO, undefined, "ATTA-IN-0003:council");

  // 3. identidade decide o PIN (Tech Lead e Backend 2 no #247): 'pedir_pin' exige o PIN, e o id do pin_mac é o do
  //    profissional que já existe sem PIN, ou um novo; 'usar_pin_existente' não leva PIN (o dele não é trocado por aqui).
  //    A recusa de identidade (conselho ou CPF de outro) é decidida no submit, contada no link.
  const id = await identidade(hashDoLink, r, d);
  if (!id.ok) return id;
  const criaPin = id.data.status === "pedir_pin";
  if (criaPin && pinDigitado === null) return campoPin("obrigatorio");
  if (!criaPin && pinDigitado !== null) return campoPin("existente");
  const professionalId = id.data.professional_id ?? (d.novoId ?? randomUUID)();

  // 4. cifra dos dados, pin_mac e o pacote do ATTA Sign (Backend 3)
  const sel = await (d.selar ?? selarProfissional)({ cpf: e.dados.cpf, celular: e.dados.whatsapp, email, professionalId });
  const mac = criaPin && pinDigitado !== null ? (d.macDoPin ?? pinMac)(professionalId, pinDigitado) : null;
  const pacote = await (d.assinar ?? ((x) => assinarTermoDeAutorizacao(x)))({
    tenantId: String(linha.tenant_id),
    vinculoId: String(linha.link_id),
    clinica: ctx.data.clinica,
    profissional: { nome: e.dados.nome.trim(), conselho: r.conselho, uf: r.uf, numero: r.numero },
    modelo: ctx.data.modelo,
    assinatura: { png: e.assinaturaPng, abertoEm: e.leitura.abertoEm, rolagemCompletaEm: e.leitura.rolagemCompletaEm, ip: e.origem.ip, userAgent: e.origem.userAgent },
  });

  // 5. o segredo do download dos dois PDFs (ADR 0001, "Download dos PDFs"): o banco recebe só o sha256 e emite o grant
  //    (30 min, até 20 downloads) na mesma transação, só se o envio gravar. O segredo volta só para a server action, que
  //    o põe no cookie HttpOnly; nunca na resposta à tela, na URL ou no log.
  const segredoDoDownload = (d.segredoDoDownload ?? gerarSegredo)();
  const hashDoDownload = hashDoSegredo(segredoDoDownload);
  if (!hashDoDownload) return falha("INTERNO", MENSAGENS.INTERNO);

  // 6. o envio final, tudo ou nada
  const { data, error } = await rpc("propass_submit", {
    p_secret_hash: bytea(hashDoLink),
    p_professional_id: professionalId,
    p_display_name: e.dados.nome.trim(),
    p_council: r.conselho,
    p_council_uf: r.uf,
    p_council_number: r.numero,
    p_cpf_hmac: sel.cpf_hmac,
    p_cpf_masked: sel.cpf_masked,
    p_cpf_enc: sel.cpf_enc,
    p_phone_enc: sel.phone_enc,
    p_email_hmac: sel.email_hmac,
    p_email_enc: sel.email_enc,
    p_dek_wrapped: sel.dek_wrapped,
    p_kek_version: sel.kek_version,
    p_council_status: estado,
    p_pin_mac: mac ? bytea(mac) : null,
    p_pin_mac_version: mac ? PIN_MAC_VERSION : null,
    p_privacy_notice_version: e.avisoDePrivacidade ?? null,
    p_download_secret_hash: bytea(hashDoDownload),
    ...pacote,
  });
  if (error) return erroDoBanco(error);
  // o Código ATTA do Termo e o segredo do download só voltam a quem acabou de assinar, e só quando o banco gravou
  // (Frontend 6, passo 4 do PROpass). O código não é dado pessoal (a verificação pública do §18 mostra só o tipo, o estado
  // e a clínica); os dois ficam fora de log
  return ok(data === "ok" ? { status: "ok", codigoAtta: pacote.p_atta_code, segredoDoDownload } : { status: "recusado" });
}
