import { afterEach, describe, expect, it, vi } from "vitest";
import Pagina from "./page";

// Stage = produção (regra do dono; S3-4 da Segurança): com a porta simulada, a produção responde 404 em /checkin/**;
// a prévia e o local abrem a tela, para o QA e os e2e (moduloDisponivel, da casca), como em painel/agenda.
vi.mock("@/server/checkin/porta", () => ({ portaCheckin: { clinica: vi.fn() } }));
afterEach(() => vi.unstubAllEnvs());

const props = { params: Promise.resolve({ portal: "aurora" }) } as Parameters<typeof Pagina>[0];

describe("guarda da rota do check-in", () => {
  it("na produção, com a porta simulada, responde 404 antes de qualquer esqueleto", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => Pagina(props)).toThrow();
  });

  it("na prévia e no local, abre a tela", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(Pagina(props)).toBeTruthy();
    vi.stubEnv("VERCEL_ENV", "");
    expect(Pagina(props)).toBeTruthy();
  });
});
