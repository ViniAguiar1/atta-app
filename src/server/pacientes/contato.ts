import "server-only";
import { getCofre, type Cofre, type CofreContext } from "@/server/cofre";
import { columnAad, open, seal } from "@/server/crypto/envelope";

// Contato do paciente cifrado por envelope (ADR 0002 §6, convenção do Tech Lead em 20/11): uma DEK por linha, guardada
// em dek_wrapped/kek_version; o contexto da DEK no Cofre é (tenant, tabela, 'dek', envelope_id) e cada valor usa a AAD
// da própria coluna, columnAad(tenant, tabela, 'phone_enc' | 'email_enc', envelope_id). Em network.person (acesso
// owner ou granted) o tenant é '' e o envelope é o id da pessoa; em network.person_tenant_link (pending, só depois de
// uma revogação) o tenant é o da clínica e o envelope é o local_envelope_id. O banco não decifra: o servidor abre aqui,
// com a DEK só em memória e zerada depois do uso.

export type ContatoCifrado = {
  phone_enc: string | null;
  email_enc: string | null;
  dek_wrapped: string | null;
  kek_version: number | null;
  envelope_id: string | null;
  network_access: string;
};

export type Lugar = { tenant: string; tabela: "network.person" | "network.person_tenant_link" };

export const lugarDoContato = (networkAccess: string, tenantId: string): Lugar =>
  networkAccess === "pending"
    ? { tenant: tenantId, tabela: "network.person_tenant_link" }
    : { tenant: "", tabela: "network.person" };

/** bytea do PostgREST (`\x0a1b…`) para bytes. */
export function deBytea(valor: string): Buffer {
  if (!/^\\x([0-9a-f]{2})*$/i.test(valor)) throw new Error("bytea fora do formato");
  return Buffer.from(valor.slice(2), "hex");
}

/** bytes para o bytea do PostgREST (`\x0a1b…`). */
export const paraBytea = (bytes: Uint8Array) => `\\x${Buffer.from(bytes).toString("hex")}`;

const contextoDaDek = (lugar: Lugar, envelopeId: string): CofreContext => ({
  tenant_id: lugar.tenant,
  table: lugar.tabela,
  column: "dek",
  id: envelopeId,
});

/** Abre celular e e-mail. Sem envelope (a clínica não tem contato), volta tudo nulo. Falha de cifra → CryptoError. */
export async function abrirContato(
  linha: ContatoCifrado,
  tenantId: string,
  cofre: Cofre = getCofre("network"),
): Promise<{ celular: string | null; email: string | null }> {
  if (!linha.dek_wrapped || linha.kek_version === null || !linha.envelope_id || (!linha.phone_enc && !linha.email_enc)) {
    return { celular: null, email: null };
  }
  const lugar = lugarDoContato(linha.network_access, tenantId);
  const dek = await cofre.unwrapDataKey(
    { kekVersion: linha.kek_version, blob: deBytea(linha.dek_wrapped) },
    contextoDaDek(lugar, linha.envelope_id),
  );
  try {
    const abrir = (valor: string | null, coluna: "phone_enc" | "email_enc") =>
      valor ? open(deBytea(valor), dek, columnAad(lugar.tenant, lugar.tabela, coluna, linha.envelope_id!)).toString("utf8") : null;
    return { celular: abrir(linha.phone_enc, "phone_enc"), email: abrir(linha.email_enc, "email_enc") };
  } finally {
    dek.fill(0);
  }
}

/** Cifra celular e e-mail com uma DEK nova (cadastro e testes). Devolve as colunas no formato do PostgREST. */
export async function selarContato(
  contato: { celular: string | null; email: string | null },
  lugar: Lugar,
  envelopeId: string,
  cofre: Cofre = getCofre("network"),
) {
  const { plaintext: dek, wrapped } = await cofre.generateDataKey(contextoDaDek(lugar, envelopeId));
  try {
    const selar = (valor: string | null, coluna: "phone_enc" | "email_enc") =>
      valor ? paraBytea(seal(Buffer.from(valor, "utf8"), dek, columnAad(lugar.tenant, lugar.tabela, coluna, envelopeId))) : null;
    return {
      phone_enc: selar(contato.celular, "phone_enc"),
      email_enc: selar(contato.email, "email_enc"),
      dek_wrapped: paraBytea(wrapped.blob),
      kek_version: wrapped.kekVersion,
    };
  } finally {
    dek.fill(0);
  }
}
