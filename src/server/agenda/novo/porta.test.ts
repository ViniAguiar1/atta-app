import { describe, expect, it, vi } from "vitest";
import { horariosLivresSchema, profissionalDoModalSchema } from "@/features/agenda/novoAgendamento";
import { falha, ok } from "@/lib/errors";
import type { LinhaDePaciente } from "@/server/pacientes/porta";
import { escolherPortaNovoAgendamento } from "./porta";
import { criarPortaNovoAgendamentoReal, pacienteDoModal, portaNovoAgendamentoReal } from "./real";
import { criarPortaNovoAgendamentoSimulada, horariosDoDia, portaNovoAgendamentoSimulada } from "./simulado";
import { portaNovoAgendamentoVazia } from "./vazia";

// Leituras do modal Novo agendamento (contrato mig-41-novo-agendamento, itens 1 a 5). 2026-11-20 é sexta-feira.
const SEGUNDA_10H30 = new Date("2026-11-23T10:30:00-03:00");
const SABADO_17H30 = new Date("2026-11-21T17:30:00-03:00");
const VINCULO = "00000000-0000-4000-8000-000000000901";
const hora = (iso: string) => iso.slice(11, 16);

describe("horários livres simulados", () => {
  it("passos de 1 h só onde a duração cabe na janela, fora da pausa; hoje, só depois de agora", () => {
    expect(horariosDoDia("2026-11-23", 60, SEGUNDA_10H30).map(hora)).toEqual(["11:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
    expect(horariosDoDia("2026-11-24", 90, SEGUNDA_10H30).map(hora)).toEqual(["08:00", "09:00", "10:00", "13:00", "14:00", "15:00", "16:00"]);
    expect(horariosDoDia("2026-11-24", 60, SEGUNDA_10H30)[0]).toBe("2026-11-24T08:00:00-03:00"); // offset da clínica
  });

  it("domingo e dia que já passou não têm horário", () => {
    expect(horariosDoDia("2026-11-29", 60, SEGUNDA_10H30)).toEqual([]);
    expect(horariosDoDia("2026-11-20", 60, SEGUNDA_10H30)).toEqual([]);
  });

  it("dia sem horário aponta o próximo livre; com horário, o primeiro do dia", async () => {
    const porta = criarPortaNovoAgendamentoSimulada(() => SABADO_17H30);
    const sabado = await porta.horariosLivres({ vinculoProfissionalId: VINCULO, dataLocal: "2026-11-21", duracaoMin: 60 });
    expect(sabado.ok && horariosLivresSchema.parse(sabado.data)).toMatchObject({
      horarios: [],
      primeiroLivre: null,
      proximoLivre: { dataLocal: "2026-11-23", inicio: "2026-11-23T08:00:00-03:00" },
    });
    const segunda = await porta.horariosLivres({ vinculoProfissionalId: VINCULO, dataLocal: "2026-11-23", duracaoMin: 30 });
    expect(segunda.ok && segunda.data).toMatchObject({ primeiroLivre: "2026-11-23T08:00:00-03:00", proximoLivre: null });
  });

  it("filtro fora do contrato é recusado (duração fora de 5–480, campo a mais)", async () => {
    for (const ruim of [
      { vinculoProfissionalId: VINCULO, dataLocal: "2026-11-23", duracaoMin: 4 },
      { vinculoProfissionalId: VINCULO, dataLocal: "2026-11-23", duracaoMin: 481 },
      { vinculoProfissionalId: "x", dataLocal: "2026-11-23", duracaoMin: 60 },
      { vinculoProfissionalId: VINCULO, dataLocal: "2026-11-23", duracaoMin: 60, extra: 1 },
    ]) {
      expect(await portaNovoAgendamentoSimulada.horariosLivres(ruim as never)).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    }
  });

  it("profissionais fictícios no formato do contrato; a simulada não inventa paciente", async () => {
    const r = await portaNovoAgendamentoSimulada.profissionais();
    expect(r.ok && r.data.map((p) => profissionalDoModalSchema.parse(p).nome)).toEqual(["Dra. Helena Prado", "Dr. Caio Andrade"]);
    expect(await portaNovoAgendamentoSimulada.buscarPaciente("Juliana")).toEqual({ ok: true, data: [] });
  });
});

describe("porta vazia do modal (produção, antes do PR A do Backend 2)", () => {
  it("nenhum profissional nem horário; durações são os padrões da PO", async () => {
    expect(await portaNovoAgendamentoVazia.profissionais()).toEqual({ ok: true, data: [] });
    expect(await portaNovoAgendamentoVazia.duracoes()).toEqual({ ok: true, data: { consulta: 60, avaliacao: 30, retorno: 30 } });
    const h = await portaNovoAgendamentoVazia.horariosLivres({ vinculoProfissionalId: VINCULO, dataLocal: "2026-11-23", duracaoMin: 60 });
    expect(h.ok && h.data).toMatchObject({ horarios: [], primeiroLivre: null, proximoLivre: null });
  });
});

describe("escolha da porta do modal por ambiente", () => {
  it("a busca é real em todos; o resto é vazio na produção e simulado fora dela", () => {
    for (const ambiente of ["production", "preview", "development", undefined]) {
      const porta = escolherPortaNovoAgendamento(ambiente);
      expect(porta.buscarPaciente).toBe(portaNovoAgendamentoReal.buscarPaciente);
      const esperada = ambiente === "production" ? portaNovoAgendamentoVazia : portaNovoAgendamentoSimulada;
      expect(porta.profissionais).toBe(esperada.profissionais);
      expect(porta.horariosLivres).toBe(esperada.horariosLivres);
    }
  });
});

describe("busca real do paciente (api.patient_search pela porta de Pacientes)", () => {
  const linha = (over: Partial<LinhaDePaciente> = {}): LinhaDePaciente => ({
    id: "00000000-0000-4000-8000-000000000101",
    nome: "Juliana Prates",
    usaNomeSocial: false,
    incompleto: false,
    selo: null,
    identificacao: { tipo: "cpf", mascarado: "···.···.247-25" },
    nascimento: null,
    contato: { celular: "(11) ·····-4321", email: null },
    atendimento: null,
    ...over,
  });

  it("só o que o modal precisa, tudo já mascarado; sem documento ou sem contato vira null", () => {
    expect(pacienteDoModal(linha())).toEqual({
      id: "00000000-0000-4000-8000-000000000101",
      nome: "Juliana Prates",
      documentoMascarado: "···.···.247-25",
      whatsappMascarado: "(11) ·····-4321",
    });
    expect(pacienteDoModal(linha({ identificacao: { tipo: "incompleto" }, contato: null }))).toMatchObject({
      documentoMascarado: null,
      whatsappMascarado: null,
    });
  });

  it("repassa o termo à porta de Pacientes e devolve a falha dela sem mexer", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(ok([linha()])).mockResolvedValueOnce(falha("INTERNO", "x"));
    const porta = criarPortaNovoAgendamentoReal({ buscar });
    expect(await porta.buscarPaciente("529.982.247-25")).toMatchObject({ ok: true, data: [{ nome: "Juliana Prates" }] });
    expect(buscar).toHaveBeenLastCalledWith("529.982.247-25");
    expect(await porta.buscarPaciente("Juliana")).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });
});
