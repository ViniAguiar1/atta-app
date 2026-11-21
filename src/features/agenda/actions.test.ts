import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ buscarPaciente: vi.fn(), horariosLivres: vi.fn() }));
vi.mock("@/server/agenda/novo/porta", () => ({
  portaNovoAgendamento: { buscarPaciente: mocks.buscarPaciente, horariosLivres: mocks.horariosLivres },
}));
vi.mock("@/server/agenda/porta", () => ({ portaAgenda: {} }));

import { buscarPacienteDoModal, horariosLivresDoModal } from "./actions";

// Actions do modal Novo agendamento: a borda recusa antes da porta o que não pode virar busca (CPF pela metade nunca vira
// prefixo; ADR 0001 §5) e o filtro fora do contrato.
describe("actions do modal Novo agendamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buscarPaciente.mockResolvedValue({ ok: true, data: [] });
  });

  it("busca: 1 letra, CPF pela metade ou campo a mais não chegam à porta", async () => {
    for (const ruim of [{ termo: "J" }, { termo: "529.982" }, { termo: "Juliana", extra: 1 }, "Juliana"]) {
      expect(await buscarPacienteDoModal(ruim)).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    }
    expect(mocks.buscarPaciente).not.toHaveBeenCalled();
  });

  it("busca: nome com 2+ letras e CPF inteiro vão à porta, aparados", async () => {
    await buscarPacienteDoModal({ termo: "  Ju " });
    expect(mocks.buscarPaciente).toHaveBeenLastCalledWith("Ju");
    await buscarPacienteDoModal({ termo: "529.982.247-25" });
    expect(mocks.buscarPaciente).toHaveBeenLastCalledWith("529.982.247-25");
  });

  it("horários: filtro fora do contrato não chega à porta", async () => {
    expect(await horariosLivresDoModal({ vinculoProfissionalId: "x", dataLocal: "2026-11-23", duracaoMin: 60 })).toMatchObject({
      ok: false,
      error: { code: "VALIDACAO" },
    });
    expect(mocks.horariosLivres).not.toHaveBeenCalled();
  });
});
