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

export function verifySeal(evidence: string, seal: Seal, manifest: readonly SealManifestEntry[]): boolean {
  if (!HEX_SHA256.test(evidence) || seal.alg !== "Ed25519") return false;
  const entry = manifest.find((e) => e.kid === seal.kid && e.alg === "Ed25519");
  if (!entry) return false;
  const pub = createPublicKey({ key: Buffer.from(entry.public_key_spki_b64, "base64"), format: "der", type: "spki" });
  return verify(null, Buffer.from(evidence, "ascii"), pub, Buffer.from(seal.sig_b64, "base64"));
}
