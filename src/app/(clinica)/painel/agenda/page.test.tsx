import { afterEach, describe, expect, it, vi } from "vitest";
import Pagina from "./page";

// Stage = produção (PLANO): enquanto /painel/agenda não está em MODULOS_PRONTOS, a produção responde 404; a prévia
// e o local abrem a tela, para o QA e os e2e (moduloDisponivel, da casca).
afterEach(() => vi.unstubAllEnvs());

describe("guarda da rota da Agenda", () => {
  it("na produção, sem a aba pronta, responde 404 antes de qualquer esqueleto", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => Pagina()).toThrow();
  });

  it("na prévia e no local, abre a tela", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(Pagina()).toBeTruthy();
    vi.stubEnv("VERCEL_ENV", "");
    expect(Pagina()).toBeTruthy();
  });
});
