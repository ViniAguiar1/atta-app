import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bloqueiosParaExcluir: vi.fn(), excluir: vi.fn() }));
vi.mock("@/server/servicos/porta", () => ({
  portaServicos: { bloqueiosParaExcluir: mocks.bloqueiosParaExcluir, excluir: mocks.excluir },
}));

import { excluirServico, REASON_SERVICO_COM_TERMOS } from "./actions";

const ID = "00000000-0000-4000-8000-0000000000c1";
const TERMOS = [
  { templateId: "00000000-0000-4000-8000-0000000000a1", titulo: "Termo Fictício A" },
  { templateId: "00000000-0000-4000-8000-0000000000a2", titulo: "Termo Fictício B" },
];
const RECUSA_DO_GATILHO = {
  ok: false as const,
  error: { code: "CONFLITO" as const, message: "x", reason: REASON_SERVICO_COM_TERMOS },
};

describe("excluirServico (action, decisão do dono R15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bloqueiosParaExcluir.mockResolvedValue({ ok: true, data: [] });
    mocks.excluir.mockResolvedValue({ ok: true, data: undefined });
  });

  it("id fora do formato: VALIDACAO, sem ir ao banco", async () => {
    expect(await excluirServico({ servicoId: "abc" })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.bloqueiosParaExcluir).not.toHaveBeenCalled();
    expect(mocks.excluir).not.toHaveBeenCalled();
  });

  it("sem termos que dependem só dele: exclui", async () => {
    expect(await excluirServico({ servicoId: ID })).toEqual({ ok: true, data: { excluido: true } });
    expect(mocks.bloqueiosParaExcluir).toHaveBeenCalledWith(ID);
    expect(mocks.excluir).toHaveBeenCalledWith(ID);
  });

  it("com termos: CONFLITO com o reason e a lista na mensagem, sem tentar excluir", async () => {
    mocks.bloqueiosParaExcluir.mockResolvedValue({ ok: true, data: TERMOS });
    expect(await excluirServico({ servicoId: ID })).toEqual({
      ok: false,
      error: {
        code: "CONFLITO",
        reason: REASON_SERVICO_COM_TERMOS,
        message: "Antes de excluir este Serviço, vincule outro procedimento a: Termo Fictício A, Termo Fictício B.",
      },
    });
    expect(mocks.excluir).not.toHaveBeenCalled();
  });

  it("corrida: o gatilho recusa depois da consulta, a lista é lida de novo e volta o mesmo erro", async () => {
    mocks.bloqueiosParaExcluir
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: [TERMOS[0]] });
    mocks.excluir.mockResolvedValue(RECUSA_DO_GATILHO);
    expect(await excluirServico({ servicoId: ID })).toEqual({
      ok: false,
      error: {
        code: "CONFLITO",
        reason: REASON_SERVICO_COM_TERMOS,
        message: "Antes de excluir este Serviço, vincule outro procedimento a: Termo Fictício A.",
      },
    });
    expect(mocks.bloqueiosParaExcluir).toHaveBeenCalledTimes(2);
  });

  it("corrida sem lista na segunda leitura: devolve a recusa do banco como veio", async () => {
    mocks.excluir.mockResolvedValue(RECUSA_DO_GATILHO);
    expect(await excluirServico({ servicoId: ID })).toEqual(RECUSA_DO_GATILHO);
  });

  it("outro erro do banco (sem permissão) passa direto, sem nova consulta", async () => {
    const semPermissao = { ok: false as const, error: { code: "SEM_PERMISSAO" as const, message: "x" } };
    mocks.excluir.mockResolvedValue(semPermissao);
    expect(await excluirServico({ servicoId: ID })).toEqual(semPermissao);
    expect(mocks.bloqueiosParaExcluir).toHaveBeenCalledTimes(1);
  });

  it("erro na consulta dos bloqueios: devolve o erro e não exclui", async () => {
    const indisponivel = { ok: false as const, error: { code: "INDISPONIVEL" as const, message: "x" } };
    mocks.bloqueiosParaExcluir.mockResolvedValue(indisponivel);
    expect(await excluirServico({ servicoId: ID })).toEqual(indisponivel);
    expect(mocks.excluir).not.toHaveBeenCalled();
  });
});
