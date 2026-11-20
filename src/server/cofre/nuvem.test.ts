import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";

// A KEK de teste do CI é pública: a nuvem (production e preview, que dividem o banco) a recusa pela impressão digital;
// o CI e o local a aceitam (ADR 0002 §1). getCofre guarda o Cofre por processo, então cada caso importa de novo.
const carregar = async () => {
  vi.resetModules();
  return import("./index");
};
afterEach(() => vi.unstubAllEnvs());

describe("getCofre e a KEK de teste", () => {
  for (const ambiente of ["production", "preview"]) {
    it(`em ${ambiente} recusa a KEK de teste e aceita outra`, async () => {
      vi.stubEnv("VERCEL_ENV", ambiente);
      vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
      const { getCofre } = await carregar();
      expect(() => getCofre("network")).toThrow("ATTA_REDE_CHAVE_MESTRA usa chave de teste");
      vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", `k1:${randomBytes(32).toString("hex")}`);
      expect((await carregar()).getCofre("network")).toBeDefined();
    });
  }

  it("no CI e no local aceita a KEK de teste", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
    expect((await carregar()).getCofre("network")).toBeDefined();
  });
});
