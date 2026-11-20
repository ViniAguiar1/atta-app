import { createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_RNE_PEPPER_HEX } from "../../../tests/fixtures/cofre-ci";

// Cada teste importa o módulo de novo: o pepper fica em cache por processo depois da primeira leitura.
const carregar = async () => {
  vi.resetModules();
  return import("./pepper");
};
afterEach(() => vi.unstubAllEnvs());

describe("pepperFromEnv", () => {
  it("as impressões digitais conferem com os peppers de teste do fixture", async () => {
    const { CI_TEST_PEPPER_FINGERPRINTS } = await carregar();
    for (const hex of [CI_TEST_CPF_PEPPER_HEX, CI_TEST_RNE_PEPPER_HEX]) {
      expect(CI_TEST_PEPPER_FINGERPRINTS.has(createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex"))).toBe(true);
    }
  });

  it("na produção recusa o pepper de teste, sem pôr o valor na mensagem", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATTA_CPF_PEPPER", CI_TEST_CPF_PEPPER_HEX);
    const { pepperFromEnv } = await carregar();
    expect(() => pepperFromEnv("ATTA_CPF_PEPPER")).toThrow("ATTA_CPF_PEPPER usa pepper de teste");
    try {
      pepperFromEnv("ATTA_CPF_PEPPER");
    } catch (e) {
      expect(String(e)).not.toContain(CI_TEST_CPF_PEPPER_HEX);
    }
  });

  it("na produção aceita outro pepper; fora dela aceita o de teste (CI, local e prévia)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATTA_RNE_PEPPER", randomBytes(32).toString("hex"));
    expect((await carregar()).pepperFromEnv("ATTA_RNE_PEPPER")).toHaveLength(32);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ATTA_RNE_PEPPER", CI_TEST_RNE_PEPPER_HEX);
    expect((await carregar()).pepperFromEnv("ATTA_RNE_PEPPER")).toHaveLength(32);
  });

  it("ausente ou malformado continua recusado", async () => {
    vi.stubEnv("ATTA_CPF_PEPPER", "curto");
    const { pepperFromEnv } = await carregar();
    expect(() => pepperFromEnv("ATTA_CPF_PEPPER")).toThrow("ATTA_CPF_PEPPER ausente ou malformado");
  });
});
