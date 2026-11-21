import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCofre, type Cofre, type CofreContext } from "@/server/cofre";
import { normalizeEmail } from "@/server/crypto/email";
import { columnAad, open, seal } from "@/server/crypto/envelope";
import { celularValido, soDigitos } from "@/lib/brasil/documentos";
import { deBytea, paraBytea } from "@/server/pacientes/contato";

// Endereço da equipe nas Configurações › Notificações (MIG-15; PDD v206 §10.4.6; contrato aprovado pelo Tech Lead em
// desenho/mig-15-notificacoes-contrato.md). O e-mail e o número da equipe são dado pessoal: o servidor valida o formato,
// cifra pelo envelope (ADR 0002 §6) e manda ao banco só o envelope e a máscara (api.notification_channel_set). A leitura
// (api.notification_settings_get) devolve só a máscara, sem Cofre. Convenção, num lugar só, para quem grava (a ação
// alterarCanal da tela) e para quem enviar os avisos depois (o disparo do MIG-15):
//   Cofre 'network'; DEK com (tenant_id, 'atta_in.notification_channel', 'dek', envelope_id) e o valor com
//   columnAad(tenant_id, 'atta_in.notification_channel', 'address_enc', envelope_id). Um envelope novo a cada troca.

export type Canal = "email" | "whatsapp";

const TABELA = "atta_in.notification_channel";
const dek = (tenantId: string, envelopeId: string): CofreContext => ({ tenant_id: tenantId, table: TABELA, column: "dek", id: envelopeId });

/** "recepcao@clinica.com.br" → "re•••@cl•••.com.br" (o banco confere este formato). */
export function mascararEmail(email: string): string {
  const [local = "", dominio = ""] = email.split("@");
  const [rotulo = "", ...resto] = dominio.split(".");
  return `${local.slice(0, 2)}•••@${rotulo.slice(0, 2)}•••.${resto.join(".")}`;
}

/** "11987650101" → "(11) •••••-••01" (o banco confere este formato). */
export function mascararCelularDaEquipe(digitos: string): string {
  return `(${digitos.slice(0, 2)}) •••••-••${digitos.slice(9, 11)}`;
}

/** Valida e normaliza o valor que a tela mandou. null = fora do formato (a ação responde VALIDACAO no campo do canal). */
export function normalizarEndereco(canal: Canal, valor: unknown): string | null {
  const texto = z.string().max(254).safeParse(valor);
  if (!texto.success) return null;
  if (canal === "email") return normalizeEmail(texto.data);
  const d = soDigitos(texto.data);
  return celularValido(d) ? d : null;
}

export type EnderecoSelado = {
  p_address_enc: string; // bytea do PostgREST (\x…)
  p_address_masked: string;
  p_envelope_id: string;
  p_dek_wrapped: string;
  p_kek_version: number;
};

/** Cifra o endereço já normalizado (normalizarEndereco) para o api.notification_channel_set. */
export async function selarEndereco(
  entrada: { tenantId: string; canal: Canal; endereco: string; envelopeId?: string },
  deps: { cofre?: Cofre } = {},
): Promise<EnderecoSelado> {
  if (normalizarEndereco(entrada.canal, entrada.endereco) !== entrada.endereco) throw new RangeError("endereço fora do formato");
  const envelopeId = entrada.envelopeId ?? randomUUID();
  const cofre = deps.cofre ?? getCofre("network");
  const { plaintext, wrapped } = await cofre.generateDataKey(dek(entrada.tenantId, envelopeId));
  try {
    const enc = seal(Buffer.from(entrada.endereco, "utf8"), plaintext, columnAad(entrada.tenantId, TABELA, "address_enc", envelopeId));
    return {
      p_address_enc: paraBytea(enc),
      p_address_masked: entrada.canal === "email" ? mascararEmail(entrada.endereco) : mascararCelularDaEquipe(entrada.endereco),
      p_envelope_id: envelopeId,
      p_dek_wrapped: paraBytea(wrapped.blob),
      p_kek_version: wrapped.kekVersion,
    };
  } finally {
    plaintext.fill(0);
  }
}

/** Abre o endereço (só o disparo dos avisos precisa; a tela nunca). */
export async function abrirEndereco(
  linha: { tenant_id: string; address_enc: string; envelope_id: string; dek_wrapped: string; kek_version: number },
  cofre: Cofre = getCofre("network"),
): Promise<string> {
  const chave = await cofre.unwrapDataKey({ kekVersion: linha.kek_version, blob: deBytea(linha.dek_wrapped) }, dek(linha.tenant_id, linha.envelope_id));
  try {
    return open(deBytea(linha.address_enc), chave, columnAad(linha.tenant_id, TABELA, "address_enc", linha.envelope_id)).toString("utf8");
  } finally {
    chave.fill(0);
  }
}
