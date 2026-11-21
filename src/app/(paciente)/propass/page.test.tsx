import { afterEach, describe, expect, it, vi } from "vitest";
import { propassNoAr } from "@/server/propass/disponivel";
import { GET } from "./[segredo]/route";
import Pagina from "./page";

// Stage = produção (PLANO; S3-4): o PROpass usa a porta real (MIG-55) e está em MODULOS_PRONTOS, então /propass e
// /propass/<segredo> abrem também na produção. A guarda continua: tirar "/propass" da lista volta o 404.
afterEach(() => vi.unstubAllEnvs());
const SEGREDO = "conv".padEnd(43, "A");
const abrirLink = () => GET(new Request(`http://127.0.0.1/propass/${SEGREDO}`), { params: Promise.resolve({ segredo: SEGREDO }) });

describe("guarda do PROpass", () => {
  it("na produção, com a porta real: a página abre e o link guarda o cookie", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(Pagina()).toBeTruthy();
    const r = await abrirLink();
    expect(r.status).toBe(303);
    expect(r.headers.get("set-cookie")).toMatch(/atta_propass_link=/);
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

  it("a guarda continua: fora de MODULOS_PRONTOS, a produção volta ao 404", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(propassNoAr(["/propass"])).toBe(true);
    expect(propassNoAr([])).toBe(false);
  });
});
