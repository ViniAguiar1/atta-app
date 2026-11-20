import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lerLink: vi.fn(), trocarLinkPorSessao: vi.fn(), confirmarPin: vi.fn() }));
vi.mock("@/server/boarding/cookies", () => ({ lerLink: mocks.lerLink, trocarLinkPorSessao: mocks.trocarLinkPorSessao }));
vi.mock("@/server/boarding/porta", () => ({ portaBoarding: { confirmarPin: mocks.confirmarPin } }));

import { confirmarPin } from "./actions";

const LINK = "vale".padEnd(43, "A");

describe("confirmarPin (action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerLink.mockResolvedValue(LINK);
  });

  it("recusa PIN fora do formato sem chamar a porta", async () => {
    const r = await confirmarPin({ pin: "12a4" });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.confirmarPin).not.toHaveBeenCalled();
  });

  it("sem o cookie do link responde como link vencido", async () => {
    mocks.lerLink.mockResolvedValue(null);
    expect(await confirmarPin({ pin: "2468" })).toEqual({ ok: true, data: { status: "indisponivel" } });
    expect(mocks.confirmarPin).not.toHaveBeenCalled();
  });

  it("PIN certo troca o link pela sessão e não devolve o segredo à tela", async () => {
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "ok", segredoDaSessao: "sess".padEnd(43, "B") } });
    const r = await confirmarPin({ pin: "2468" });
    expect(mocks.confirmarPin).toHaveBeenCalledWith(LINK, "2468");
    expect(mocks.trocarLinkPorSessao).toHaveBeenCalledWith("sess".padEnd(43, "B"));
    expect(r).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("repassa o desfecho do servidor sem contar tentativas", async () => {
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "pin_incorreto" } });
    expect(await confirmarPin({ pin: "1111" })).toEqual({ ok: true, data: { status: "pin_incorreto" } });
    const ate = new Date(Date.now() + 15 * 60_000).toISOString();
    mocks.confirmarPin.mockResolvedValue({ ok: true, data: { status: "bloqueado", bloqueadoAte: ate } });
    expect(await confirmarPin({ pin: "1111" })).toEqual({ ok: true, data: { status: "bloqueado", minutos: 15 } });
    expect(mocks.trocarLinkPorSessao).not.toHaveBeenCalled();
  });
});
