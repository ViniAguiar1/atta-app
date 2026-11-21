import { afterEach, describe, expect, it, vi } from "vitest";
import Pagina from "./page";

// Stage = produção (PLANO; S3-4 da Segurança): o Boarding Check usa a porta real (MIG-23 parte 3b) e está em
// MODULOS_PRONTOS, então /boarding abre também na produção. A guarda continua: fora da lista, a produção volta ao 404.
afterEach(() => vi.unstubAllEnvs());

describe("guarda do /boarding", () => {
  it("na produção, com a porta real, abre a tela", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(Pagina()).toBeTruthy();
  });

  it("na prévia e no local, abre a tela", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(Pagina()).toBeTruthy();
    vi.stubEnv("VERCEL_ENV", "");
    expect(Pagina()).toBeTruthy();
  });
});
