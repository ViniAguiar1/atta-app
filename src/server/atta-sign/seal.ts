/**
 * Selo Ed25519 destacado sobre o `evidence_sha256` (ADR 0006 §7, ADR 0014): assina os 64 caracteres hex em ASCII.
 * O atta-core não tinha implementação nem vetor de selo; esta forma vira o vetor `seal_v1` no PR do MIG-21.
 * Chave privada só no servidor (variável sensível da Vercel, valores diferentes em Production e Preview; o kid de
 * preview começa com `staging-seal-` e nunca entra no manifesto de produção). A verificação recebe o MANIFESTO
 * (append-only, em /.well-known/atta-seal-keys.json), não uma chave.
 * Carimbo do tempo (RFC 3161): fora do MVP (decisão do dono); entra depois como `timestamps[]` aditivo, fora do hash
 * e da assinatura, em documents.seal_timestamp. Nada aqui muda quando ele chegar.
 */
import "server-only";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export type SealManifestEntry = Readonly<{
  kid: string;
  alg: "Ed25519";
  public_key_spki_b64: string;
  valid_from: string;
  valid_until: string | null;
}>;

export type SealTimestamp = Readonly<{ kind: "rfc3161"; token_b64: string; issuer: string }>;

export type Seal = Readonly<{ kid: string; alg: "Ed25519"; sig_b64: string; timestamps?: readonly SealTimestamp[] }>;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function signEvidence(evidence: string, kid: string, privateKeyPem: string): Seal {
  if (!HEX_SHA256.test(evidence)) throw new Error("evidence_sha256 inválido");
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("a chave de selo é Ed25519");
  return { kid, alg: "Ed25519", sig_b64: sign(null, Buffer.from(evidence, "ascii"), key).toString("base64") };
}

// Data ISO 8601 em UTC (como o manifesto e o payload gravam); outra forma não é aceita
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

// O Date.parse aceita data impossível com o formato certo (30/02 vira 02/03): cada campo precisa voltar igual.
function instante(valor: unknown): number | null {
  if (typeof valor !== "string") return null;
  const m = ISO_UTC.exec(valor);
  if (!m) return null;
  const ms = Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const campos = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(),
    d.getUTCSeconds()];
  return campos.every((c, i) => c === Number(m[i + 1])) ? ms : null;
}

/**
 * Confere o selo da evidência pelo manifesto público (MIG-24, revisão do #24 pelo Tech Lead e pelo Backend 1):
 * - o kid precisa estar no manifesto, e o momento da assinatura (`signedAt`, o `signature.signed_at` da evidência) tem
 *   de cair dentro da validade da chave: `valid_from` ≤ `signedAt` < `valid_until` (sem `valid_until`, chave vigente).
 *   Uma chave aposentada não valida selo com data posterior à aposentadoria.
 * - qualquer entrada malformada (manifesto, chave, assinatura ou data) devolve `false`, nunca lança: a verificação
 *   pública não pode virar erro 500 nem oráculo.
 */
export function verifySeal(
  evidence: string,
  seal: Seal,
  manifest: readonly SealManifestEntry[],
  signedAt: string,
): boolean {
  try {
    if (!HEX_SHA256.test(evidence) || seal?.alg !== "Ed25519" || typeof seal.sig_b64 !== "string") return false;
    const quando = instante(signedAt);
    if (quando === null || !Array.isArray(manifest)) return false;
    const entry = manifest.find((e) => e?.kid === seal.kid && e?.alg === "Ed25519");
    if (!entry || typeof entry.public_key_spki_b64 !== "string") return false;
    const desde = instante(entry.valid_from);
    if (desde === null || quando < desde) return false;
    if (entry.valid_until !== null) {
      const ate = instante(entry.valid_until);
      if (ate === null || quando >= ate) return false;
    }
    const pub = createPublicKey({ key: Buffer.from(entry.public_key_spki_b64, "base64"), format: "der", type: "spki" });
    if (pub.asymmetricKeyType !== "ed25519") return false;
    return verify(null, Buffer.from(evidence, "ascii"), pub, Buffer.from(seal.sig_b64, "base64"));
  } catch {
    return false;
  }
}
