import { afterEach, describe, expect, it, vi } from "vitest";
import Pagina from "./page";

// Stage = produção (PLANO; S3-4 da Segurança): com a porta simulada, a produção responde 404 antes de qualquer
// esqueleto; a prévia, o local e o CI abrem a tela, para o QA e os e2e.
afterEach(() => vi.unstubAllEnvs());

describe("guarda do /boarding", () => {
  it("na produção, com a porta simulada, responde 404", () => {
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
