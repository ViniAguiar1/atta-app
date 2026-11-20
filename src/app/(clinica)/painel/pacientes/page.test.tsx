import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

// As abas do painel aparecem sempre (decisão do dono, 20/11): Pacientes abre na produção, na prévia e no local.
afterEach(() => vi.unstubAllEnvs());

describe("rota de Pacientes", () => {
  it("abre em todo ambiente, sem 404", () => {
    for (const ambiente of ["production", "preview", ""]) {
      vi.stubEnv("VERCEL_ENV", ambiente);
      expect(Page()).toBeTruthy();
    }
  });
});
