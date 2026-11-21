import "server-only";
import { randomUUID } from "node:crypto";
import { getCofre, type Cofre, type CofreContext } from "@/server/cofre";
import { cpfHmac, isValidCpf, maskCpf, normalizeCpf } from "@/server/crypto/cpf";
import { emailHmac, normalizeEmail } from "@/server/crypto/email";
import { columnAad, open, seal } from "@/server/crypto/envelope";
import { deBytea, paraBytea } from "@/server/pacientes/contato";

// Envelopes do profissional (ADR 0001 §1 e ADR 0002 §6), num lugar só, para quem convida (Equipe & Permissões), quem
// abre o PROpass (api.propass_resolve) e quem envia (api.propass_submit) usarem a mesma convenção:
//   - convite: dado da clínica, no vínculo. Cofre 'network'; DEK com o contexto
//     (tenant_id, 'platform.professional_tenant_link', 'dek', envelope_id) e o valor com
//     columnAad(tenant_id, 'platform.professional_tenant_link', 'invite_email_enc', envelope_id). O envelope_id nasce no
//     servidor, antes do convite. O invite_email_hmac é o emailHmac (único por clínica enquanto o vínculo vive).
//   - profissional: dado de rede, global. Cofre 'network'; DEK com ('', 'platform.professional', 'dek', professional_id)
//     e cada coluna com columnAad('', 'platform.professional', coluna, professional_id). O professional_id nasce no
//     servidor (entra na AAD); se o banco ligar a um profissional que já existe, os dados dele não mudam.
// O banco não cifra nem calcula HMAC. A DEK fica só em memória e é zerada depois do uso.

const TABELA_VINCULO = "platform.professional_tenant_link";
const TABELA_PROFISSIONAL = "platform.professional";

const dekDoVinculo = (tenantId: string, envelopeId: string): CofreContext => ({
  tenant_id: tenantId,
  table: TABELA_VINCULO,
  column: "dek",
  id: envelopeId,
});
const dekDoProfissional = (professionalId: string): CofreContext => ({
  tenant_id: "",
  table: TABELA_PROFISSIONAL,
  column: "dek",
  id: professionalId,
});

export type ConviteSelado = {
  invite_email_hmac: string; // bytea do PostgREST (\x…)
  invite_email_enc: string;
  envelope_id: string;
  dek_wrapped: string;
  kek_version: number;
};

type Hmac = (valor: string) => Buffer;

/** Cifra o e-mail do convite (Equipe & Permissões, api.professional_invite e o reenvio com troca de e-mail). */
export async function selarConvite(
  entrada: { tenantId: string; email: string; envelopeId?: string },
  deps: { cofre?: Cofre; hmacDoEmail?: Hmac } = {},
): Promise<ConviteSelado> {
  const email = normalizeEmail(entrada.email);
  if (!email) throw new RangeError("e-mail do convite fora da forma");
  const envelopeId = entrada.envelopeId ?? randomUUID();
  const cofre = deps.cofre ?? getCofre("network");
  const { plaintext: dek, wrapped } = await cofre.generateDataKey(dekDoVinculo(entrada.tenantId, envelopeId));
  try {
    const enc = seal(Buffer.from(email, "utf8"), dek, columnAad(entrada.tenantId, TABELA_VINCULO, "invite_email_enc", envelopeId));
    return {
      invite_email_hmac: paraBytea((deps.hmacDoEmail ?? emailHmac)(email)),
      invite_email_enc: paraBytea(enc),
      envelope_id: envelopeId,
      dek_wrapped: paraBytea(wrapped.blob),
      kek_version: wrapped.kekVersion,
    };
  } finally {
    dek.fill(0);
  }
}

/** A linha do convite como o api.propass_resolve (ou o professional_get, antes do PROpass) devolve. */
export type ConviteCifrado = {
  tenant_id: string;
  invite_email_enc: string;
  invite_envelope_id: string;
  invite_dek_wrapped: string;
  invite_kek_version: number;
};

/** Abre o e-mail do convite, para a tela do PROpass mostrar travado. Falha de cifra → CryptoError (sem detalhe). */
export async function abrirConvite(linha: ConviteCifrado, cofre: Cofre = getCofre("network")): Promise<string> {
  const dek = await cofre.unwrapDataKey(
    { kekVersion: linha.invite_kek_version, blob: deBytea(linha.invite_dek_wrapped) },
    dekDoVinculo(linha.tenant_id, linha.invite_envelope_id),
  );
  try {
    return open(
      deBytea(linha.invite_email_enc),
      dek,
      columnAad(linha.tenant_id, TABELA_VINCULO, "invite_email_enc", linha.invite_envelope_id),
    ).toString("utf8");
  } finally {
    dek.fill(0);
  }
}

export type ProfissionalSelado = {
  professional_id: string;
  cpf_hmac: string;
  cpf_masked: string;
  cpf_enc: string;
  phone_enc: string;
  email_hmac: string;
  email_enc: string;
  dek_wrapped: string;
  kek_version: number;
};

/**
 * Cifra os dados que o profissional digitou no PROpass, para o api.propass_submit. O e-mail é o do convite (travado):
 * quem chama passa o que o abrirConvite devolveu, nunca um campo do navegador. CPF inválido ou e-mail fora da forma →
 * RangeError, sem o valor na mensagem (a server action já validou com Zod; isto é a última barreira).
 */
export async function selarProfissional(
  entrada: { cpf: string; celular: string; email: string; professionalId?: string },
  deps: { cofre?: Cofre; hmacDoCpf?: Hmac; hmacDoEmail?: Hmac } = {},
): Promise<ProfissionalSelado> {
  const cpf = normalizeCpf(entrada.cpf);
  if (!cpf || !isValidCpf(cpf)) throw new RangeError("CPF inválido");
  const email = normalizeEmail(entrada.email);
  if (!email) throw new RangeError("e-mail fora da forma");
  if (!/^[0-9]{10,13}$/.test(entrada.celular)) throw new RangeError("celular fora da forma");
  const id = entrada.professionalId ?? randomUUID();
  const cofre = deps.cofre ?? getCofre("network");
  const { plaintext: dek, wrapped } = await cofre.generateDataKey(dekDoProfissional(id));
  try {
    const selar = (valor: string, coluna: "cpf_enc" | "phone_enc" | "email_enc") =>
      paraBytea(seal(Buffer.from(valor, "utf8"), dek, columnAad("", TABELA_PROFISSIONAL, coluna, id)));
    return {
      professional_id: id,
      cpf_hmac: paraBytea((deps.hmacDoCpf ?? cpfHmac)(cpf)),
      cpf_masked: maskCpf(cpf),
      cpf_enc: selar(cpf, "cpf_enc"),
      phone_enc: selar(entrada.celular, "phone_enc"),
      email_hmac: paraBytea((deps.hmacDoEmail ?? emailHmac)(email)),
      email_enc: selar(email, "email_enc"),
      dek_wrapped: paraBytea(wrapped.blob),
      kek_version: wrapped.kekVersion,
    };
  } finally {
    dek.fill(0);
  }
}
