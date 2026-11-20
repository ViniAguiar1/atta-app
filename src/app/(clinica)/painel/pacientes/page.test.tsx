import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULOS_PRONTOS, moduloDisponivel } from "@/features/casca/abas";
import Page from "./page";

// Stage = produção (PLANO): com a porta real, /painel/pacientes está em MODULOS_PRONTOS e abre também na produção.
// A regra da guarda (404 na produção para módulo fora da lista) continua valendo para os outros módulos.
afterEach(() => vi.unstubAllEnvs());

describe("guarda da rota de Pacientes", () => {
  it("Pacientes está entre os módulos prontos e abre na produção, na prévia e no local", () => {
    expect(MODULOS_PRONTOS).toContain("/painel/pacientes");
    for (const ambiente of ["production", "preview", ""]) {
      vi.stubEnv("VERCEL_ENV", ambiente);
      expect(Page()).toBeTruthy();
    }
  });

  it("fora da lista de prontos, a mesma guarda daria 404 na produção", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(moduloDisponivel("/painel/pacientes", [])).toBe(false);
  });
});
