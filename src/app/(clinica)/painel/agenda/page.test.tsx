import { afterEach, describe, expect, it, vi } from "vitest";
import Pagina from "./page";

// A aba da Agenda aparece sempre (decisão do dono, 20/11): a rota abre em todo ambiente. O que muda é a porta (vazia na
// produção até a real, simulada na prévia, no local e no CI; src/server/agenda/porta.ts).
afterEach(() => vi.unstubAllEnvs());

describe("rota da Agenda", () => {
  it("abre em todo ambiente, sem 404", () => {
    for (const ambiente of ["production", "preview", ""]) {
      vi.stubEnv("VERCEL_ENV", ambiente);
      expect(Pagina()).toBeTruthy();
    }
  });
});
