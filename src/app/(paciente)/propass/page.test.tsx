import { afterEach, describe, expect, it, vi } from "vitest";
import { propassNoAr } from "@/server/propass/disponivel";
import { GET } from "./[segredo]/route";
import Pagina from "./page";

// Stage = produção (PLANO; S3-4): com a porta simulada, /propass e /propass/<segredo> dão 404 na produção.
afterEach(() => vi.unstubAllEnvs());
const SEGREDO = "conv".padEnd(43, "A");
const abrirLink = () => GET(new Request(`http://127.0.0.1/propass/${SEGREDO}`), { params: Promise.resolve({ segredo: SEGREDO }) });

describe("guarda do PROpass", () => {
  it("na produção: página 404 e link 404 sem cookie", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => Pagina()).toThrow();
    const r = await abrirLink();
    expect(r.status).toBe(404);
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it("na prévia e no local: a página abre e o link guarda o cookie e manda para /propass", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(Pagina()).toBeTruthy();
    const r = await abrirLink();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/propass");
    expect(r.headers.get("set-cookie")).toMatch(/atta_propass_link=.*Path=\/propass/i);
    vi.stubEnv("VERCEL_ENV", "");
    expect(Pagina()).toBeTruthy();
  });

  it("com /propass em MODULOS_PRONTOS (porta real), abre também na produção", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(propassNoAr(["/propass"])).toBe(true);
  });
});
