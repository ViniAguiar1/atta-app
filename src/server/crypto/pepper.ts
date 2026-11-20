// Pepper de HMAC de documento, um por documento (ATTA_CPF_PEPPER, ATTA_RNE_PEPPER): hex, ≥ 32 bytes, só servidor.
import "server-only";
import { createHash } from "node:crypto";

/**
 * Impressões digitais (SHA-256 dos bytes) dos peppers de TESTE de tests/fixtures/cofre-ci.ts, públicos (CI, local e
 * seed). A produção os recusa, como recusa a KEK de teste (master-key.ts, CI_TEST_KEK_FINGERPRINT): sem isso, um pepper
 * de teste esquecido na Vercel tornaria o cpf_hmac calculável por qualquer um (pedido da Segurança no #91).
 */
export const CI_TEST_PEPPER_FINGERPRINTS: ReadonlySet<string> = new Set([
  "d0b79c527f7935a8543030bf8f864a68792c10b9de09717a8e5d0e92c03f941b", // CI_TEST_CPF_PEPPER_HEX
  "66909cca1e8c3122602e71fe5dea42a026e698fff15ec2c6482f2985057c55ed", // CI_TEST_RNE_PEPPER_HEX
]);

const peppers = new Map<string, Buffer>();

export function pepperFromEnv(name: string): Buffer {
  let pepper = peppers.get(name);
  if (!pepper) {
    const hex = process.env[name];
    if (!hex || !/^([0-9a-f]{2}){32,}$/.test(hex)) throw new Error(`${name} ausente ou malformado`);
    pepper = Buffer.from(hex, "hex");
    const digital = createHash("sha256").update(pepper).digest("hex");
    if (process.env.VERCEL_ENV === "production" && CI_TEST_PEPPER_FINGERPRINTS.has(digital)) {
      throw new Error(`${name} usa pepper de teste`); // a mensagem nunca leva o valor
    }
    peppers.set(name, pepper);
  }
  return pepper;
}
