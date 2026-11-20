import { beforeEach, describe, expect, it, vi } from "vitest";

// ADR 0004 §3 (decisão do TL a partir do #29): toda action do fluxo de link confere a sessão antes de qualquer coisa.
const sessao = vi.hoisted(() => ({ lerSessaoSimulada: vi.fn() }));
const porta = vi.hoisted(() => ({ portaCadastro: { carregar: vi.fn(), salvar: vi.fn(), buscarCep: vi.fn() } }));
vi.mock("@/server/checkin/sessao-simulada", () => sessao);
vi.mock("@/server/cadastro/porta", () => porta);

const { buscarCep, carregarDados, salvarDados } = await import("./actions");

describe("actions do cadastro sem sessão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessao.lerSessaoSimulada.mockResolvedValue(null);
  });

  it("recusam com NAO_AUTENTICADO e nem chegam à porta", async () => {
    for (const r of [await carregarDados(), await salvarDados({}), await buscarCep("01310100")]) {
      expect(r).toMatchObject({ ok: false, error: { code: "NAO_AUTENTICADO" } });
    }
    expect(porta.portaCadastro.carregar).not.toHaveBeenCalled();
    expect(porta.portaCadastro.salvar).not.toHaveBeenCalled();
    expect(porta.portaCadastro.buscarCep).not.toHaveBeenCalled();
  });

  it("com sessão, o CEP chega à porta", async () => {
    sessao.lerSessaoSimulada.mockResolvedValue("00000000-1111-4111-8111-111111111111");
    porta.portaCadastro.buscarCep.mockResolvedValue({ ok: true, data: {} });
    await buscarCep("01310100");
    expect(porta.portaCadastro.buscarCep).toHaveBeenCalledWith("01310100");
  });
});
