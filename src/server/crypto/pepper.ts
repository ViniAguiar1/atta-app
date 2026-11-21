// Pepper de HMAC, um por finalidade (ATTA_CPF_PEPPER, ATTA_RNE_PEPPER, ATTA_PIN_PEPPER): hex, ≥ 32 bytes, só servidor.
import "server-only";
import { createHash } from "node:crypto";

/**
 * Impressões digitais (SHA-256 dos bytes) dos peppers de TESTE de tests/fixtures/cofre-ci.ts, públicos (CI, local e
 * seed). A nuvem (production e preview, que hoje dividem o banco) os recusa, como recusa a KEK de teste (ADR 0002 §1):
 * sem isso, um pepper de teste na Vercel tornaria o cpf_hmac calculável por qualquer um (Segurança e Tech Lead, #91).
 */
export const CI_TEST_PEPPER_FINGERPRINTS: ReadonlySet<string> = new Set([
  "d0b79c527f7935a8543030bf8f864a68792c10b9de09717a8e5d0e92c03f941b", // CI_TEST_CPF_PEPPER_HEX
  "66909cca1e8c3122602e71fe5dea42a026e698fff15ec2c6482f2985057c55ed", // CI_TEST_RNE_PEPPER_HEX
  "a6f0c476addb023e1254b7ab653929ec78b48082e72dbacde6e4f36ee42906c9", // CI_TEST_PIN_PEPPER_HEX
]);

/** Produção e prévia da Vercel: onde as chaves de teste nunca valem. No CI e no local o VERCEL_ENV fica vazio. */
export const naNuvem = () => process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";

const peppers = new Map<string, Buffer>();

export function pepperFromEnv(name: string): Buffer {
  let pepper = peppers.get(name);
  if (!pepper) {
    const hex = process.env[name];
    if (!hex || !/^([0-9a-f]{2}){32,}$/.test(hex)) throw new Error(`${name} ausente ou malformado`);
    pepper = Buffer.from(hex, "hex");
    const digital = createHash("sha256").update(pepper).digest("hex");
    if (naNuvem() && CI_TEST_PEPPER_FINGERPRINTS.has(digital)) {
      throw new Error(`${name} usa pepper de teste`); // a mensagem nunca leva o valor
    }
    peppers.set(name, pepper);
  }
  return pepper;
}
