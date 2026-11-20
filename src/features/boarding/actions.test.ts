import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lerHashDoLink: vi.fn(),
  apagarLink: vi.fn(),
  gravarGrant: vi.fn(),
  apagarGrant: vi.fn(),
  confirmarPin: vi.fn(),
}));
vi.mock("@/server/boarding/cookies", () => ({ lerHashDoLink: mocks.lerHashDoLink, apagarLink: mocks.apagarLink }));
vi.mock("@/server/grant/cookie", () => ({ gravarGrant: mocks.gravarGrant, apagarGrant: mocks.apagarGrant }));
vi.mock("@/server/boarding/porta", () => ({ portaBoarding: { confirmarPin: mocks.confirmarPin } }));

import { confirmarPin } from "./actions";

const HASH_LINK = Buffer.alloc(32, 1);
const HASH_SESSAO = Buffer.alloc(32, 2);

describe("confirmarPin (action)", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerHashDoLink.mockResolvedValue(HASH_LINK);
    mocks.gravarGrant.mockResolvedValue(HASH_SESSAO);
  });

  it("recusa PIN fora do formato sem chamar a porta nem gravar sessão", async () => {
    const r = await confirmarPin({ pin: "12a4" });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.confirmarPin).not.toHaveBeenCalled();
    expect(mocks.gravarGrant).not.toHaveBeenCalled();
  });

  it("sem o cookie do link responde como link vencido", async () => {
    mocks.lerHashDoLink.mockResolvedValue(null);
    expect(await confirmarPin({ pin: "2468" })).toEqual({ ok: true, data: { status: "indisponivel" } });
    expect(mocks.confirmarPin).not.toHaveBeenCalled();
    expect(mocks.gravarGrant).not.toHaveBeenCalled();
  });

  it("PIN certo: a porta recebe só hashes, o grant fica e o link sai", async () => {
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "ok" } });
    const r = await confirmarPin({ pin: "2468" });
    expect(mocks.gravarGrant).toHaveBeenCalledWith("professional_boarding");
    expect(mocks.confirmarPin).toHaveBeenCalledWith(HASH_LINK, "2468", HASH_SESSAO);
    expect(mocks.apagarLink).toHaveBeenCalled();
    expect(mocks.apagarGrant).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("PIN que não vale apaga a sessão e repassa o desfecho sem contar tentativas", async () => {
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "pin_incorreto" } });
    expect(await confirmarPin({ pin: "1111" })).toEqual({ ok: true, data: { status: "pin_incorreto" } });
    const ate = new Date(Date.now() + 15 * 60_000).toISOString();
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "bloqueado", bloqueadoAte: ate } });
    expect(await confirmarPin({ pin: "1111" })).toEqual({ ok: true, data: { status: "bloqueado", minutos: 15 } });
    mocks.confirmarPin.mockResolvedValue({ ok: false, error: { code: "INDISPONIVEL", message: "fora do ar" } });
    expect(await confirmarPin({ pin: "1111" })).toMatchObject({ ok: false, error: { code: "INDISPONIVEL" } });
    expect(mocks.apagarGrant).toHaveBeenCalledTimes(3);
    expect(mocks.apagarLink).not.toHaveBeenCalled();
  });

  it("link que não vale mais apaga também o cookie do link", async () => {
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "indisponivel" } });
    expect(await confirmarPin({ pin: "2468" })).toEqual({ ok: true, data: { status: "indisponivel" } });
    expect(mocks.apagarGrant).toHaveBeenCalled();
    expect(mocks.apagarLink).toHaveBeenCalled();
  });

  it("na produção, com a porta simulada, recusa sem ler cookie nem chamar a porta", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await confirmarPin({ pin: "2468" })).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    expect(mocks.lerHashDoLink).not.toHaveBeenCalled();
    expect(mocks.confirmarPin).not.toHaveBeenCalled();
    expect(mocks.gravarGrant).not.toHaveBeenCalled();
  });
});
