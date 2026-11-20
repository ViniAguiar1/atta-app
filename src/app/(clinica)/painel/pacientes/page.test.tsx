import { afterEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

// Stage = produção (PLANO): enquanto /painel/pacientes não está em MODULOS_PRONTOS, a produção responde 404; a prévia,
// o local e o CI abrem a tela, para o QA e os e2e (moduloDisponivel, da casca).
afterEach(() => vi.unstubAllEnvs());

describe("guarda da rota de Pacientes", () => {
  it("na produção, sem a aba pronta, responde 404 antes de qualquer esqueleto", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => Page()).toThrow();
  });

  it("na prévia e no local, abre a tela", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(Page()).toBeTruthy();
    vi.stubEnv("VERCEL_ENV", "");
    expect(Page()).toBeTruthy();
  });
});
