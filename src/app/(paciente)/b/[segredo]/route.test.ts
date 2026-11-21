import { afterEach, describe, expect, it, vi } from "vitest";
import { boardingNoAr } from "@/server/boarding/disponivel";
import { GET } from "./route";

const SEGREDO = "vale".padEnd(43, "A");
const chamar = () => GET(new Request(`http://127.0.0.1/b/${SEGREDO}`), { params: Promise.resolve({ segredo: SEGREDO }) });

afterEach(() => vi.unstubAllEnvs());

describe("GET /b/[segredo]", () => {
  it("na produção, com a porta real, guarda o link e manda para /boarding", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const r = await chamar();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/boarding");
    expect(r.headers.get("set-cookie")).toMatch(/atta_boarding_link=.*Path=\/boarding/i);
  });

  it("na prévia, guarda o link e manda para /boarding", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const r = await chamar();
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/boarding");
    expect(r.headers.get("set-cookie")).toMatch(/atta_boarding_link=/);
  });
});

describe("boardingNoAr", () => {
  it("com /boarding em MODULOS_PRONTOS (porta real), abre também na produção", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(boardingNoAr(["/boarding"])).toBe(true);
    expect(boardingNoAr([])).toBe(false);
  });
});
