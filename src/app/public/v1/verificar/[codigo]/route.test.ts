// GET /public/v1/verificar/{codigo} (MIG-24): status HTTP e cabeçalhos. A regra está em verificar.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const verificarCodigo = vi.fn();
vi.mock("@/server/verificacao/verificar", () => ({ verificarCodigo }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { GET } = await import("./route");

const chamar = (codigo: string) =>
  GET(new Request(`http://local.invalid/public/v1/verificar/${codigo}`, { headers: { "x-forwarded-for": "203.0.113.7" } }), {
    params: Promise.resolve({ codigo }),
  });

const NAO = {
  exists: false, tenant_trade_name: null, document_type: null, template_version: null, signed_at: null, status: null,
  evidence_sha256: null, level: null,
};

beforeEach(() => verificarCodigo.mockReset());

describe("GET /public/v1/verificar/{codigo}", () => {
  it("200 com as 8 chaves, sem cache, sem indexar e sem referrer", async () => {
    verificarCodigo.mockResolvedValue({ ok: true, data: NAO });
    const r = await chamar("ATTA-0000-0000-0000");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(NAO);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(verificarCodigo.mock.calls[0]![0]).toBe("ATTA-0000-0000-0000");
    expect((verificarCodigo.mock.calls[0]![1] as Headers).get("x-forwarded-for")).toBe("203.0.113.7");
  });

  it("limite: 429 com Retry-After", async () => {
    verificarCodigo.mockResolvedValue({ ok: false, error: { code: "LIMITE", message: "Muitas tentativas." } });
    const r = await chamar("ATTA-0000-0000-0000");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(await r.json()).toEqual({ code: "LIMITE", message: "Muitas tentativas." });
  });

  it("banco fora: 503; outro erro: 500, sem detalhe", async () => {
    verificarCodigo.mockResolvedValue({ ok: false, error: { code: "INDISPONIVEL", message: "Indisponível." } });
    expect((await chamar("x")).status).toBe(503);
    verificarCodigo.mockResolvedValue({ ok: false, error: { code: "INTERNO", message: "Algo deu errado.", reason: "x" } });
    const r = await chamar("x");
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ code: "INTERNO", message: "Algo deu errado." });
  });
});
