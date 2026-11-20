import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estadoDeDados } from "@/components/ui/DataState";
import { falha, ok, type Resultado } from "@/lib/errors";
import { portaAgendaSimulada } from "@/server/agenda/simulado";
import type { DiaDaAgenda } from "../schema";
import { textos } from "../textos";
import { AgendaHoje } from "./AgendaHoje";

// A tela só prova que entrega cada estado ao DataState (os quatro estados são testados uma vez nele) e o que é dela:
// colunas do PDD §10.2.2, chips e selo Atrasado, documentos, CPF para o leitor de tela e a busca por server action.

async function diaSimulado(): Promise<DiaDaAgenda> {
  const r = await portaAgendaSimulada.dia({});
  if (!r.ok) throw new Error("simulado falhou");
  return r.data;
}

const vazio = (dia: DiaDaAgenda): DiaDaAgenda => ({ ...dia, linhas: [] });

const RESUMO = ok({
  hojeFaltam: 6,
  hojeConcluidos: 1,
  mesConcluidos: 2,
  mesHorariosLivres: 175,
  checkin: { emPreenchimento: 1, pronto: 1, emAtendimento: 1 },
  confirmacao: { agendados: 6, aConfirmar: 2, confirmados: 4 },
  semDocumento: 1,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function digitar(texto: string) {
  fireEvent.change(screen.getByRole("searchbox", { name: textos.busca.rotulo }), { target: { value: texto } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe("Agenda › Hoje", () => {
  it("mostra a data da clínica por extenso e as colunas do PDD, com o horário em ordem crescente", async () => {
    const dia = await diaSimulado();
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(dia)} buscar={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/feira|sábado|domingo/i);
    const cabecalhos = screen.getAllByRole("columnheader").map((th) => th.textContent?.replace("↑", "").trim());
    expect(cabecalhos).toEqual(["Horário", "Paciente", "Procedimento", "Profissional", "Documentos", "Status"]);
    expect(screen.getByRole("columnheader", { name: /Horário/ }).getAttribute("aria-sort")).toBe("ascending");
    const horarios = screen.getAllByRole("row").slice(1).map((tr) => tr.querySelector("td")?.textContent);
    expect(horarios).toEqual(["09:30", "10:00", "10:30", "11:00", "14:00", "15:00", "16:30"]);
  });

  it("chips de status, o selo Atrasado ao lado do Agendado e o envio do Boarding Check", async () => {
    const { container } = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(await diaSimulado())} buscar={vi.fn()} />);
    expect(estadoDeDados(container)).toBe("pronto");
    const mariana = screen.getByRole("row", { name: /Mariana Costa Albuquerque/ });
    expect(within(mariana).getByText("Agendado")).toBeDefined();
    expect(within(mariana).getByText("Atrasado")).toBeDefined();
    const juliana = screen.getByRole("row", { name: /Juliana Prates/ });
    expect(within(juliana).getByText("Em atendimento")).toBeDefined();
    expect(within(juliana).getByText("Boarding Check enviado às 10:44")).toBeDefined();
    const status = [...container.querySelectorAll("[data-status]")].map((el) => el.getAttribute("data-status"));
    expect(new Set(status)).toEqual(
      new Set(["agendado", "em_preenchimento", "pronto", "em_atendimento", "ausente", "cancelado"]),
    );
  });

  it("documentos com o estado por extenso para o leitor, opcional e Nenhum documento", async () => {
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(await diaSimulado())} buscar={vi.fn()} />);
    const juliana = screen.getByRole("row", { name: /Juliana Prates/ });
    expect(within(juliana).getByText(", assinado")).toBeDefined();
    expect(within(juliana).getByText(", assinatura recusada")).toBeDefined();
    expect(within(juliana).getByText("opcional")).toBeDefined();
    const eduardo = screen.getByRole("row", { name: /Eduardo Lima/ });
    expect(within(eduardo).getByText("Nenhum documento")).toBeDefined();
  });

  it("CPF mascarado na tela e lido como 'CPF terminado em' pelo leitor", async () => {
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(await diaSimulado())} buscar={vi.fn()} />);
    const mariana = screen.getByRole("row", { name: /Mariana Costa Albuquerque/ });
    expect(within(mariana).getByText("···.···.484-35").getAttribute("aria-hidden")).toBe("true");
    expect(within(mariana).getByText("CPF terminado em 484-35")).toBeDefined();
  });

  it("dia sem agendamento: vazio; falha do servidor: erro com tentar de novo", async () => {
    const dia = await diaSimulado();
    const semNada = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(vazio(dia))} buscar={vi.fn()} />);
    expect(estadoDeDados(semNada.container)).toBe("vazio");
    semNada.unmount();

    const buscar = vi.fn<(f: unknown) => Promise<Resultado<DiaDaAgenda>>>().mockResolvedValue(ok(dia));
    const comErro = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={falha("INDISPONIVEL", "fora")} buscar={buscar} />);
    expect(estadoDeDados(comErro.container)).toBe("erro");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscar).toHaveBeenCalledWith({});
    expect(estadoDeDados(comErro.container)).toBe("pronto");
  });

  it("a busca vai pela server action, no corpo; sem achado mostra sem resultado e limpar volta ao dia", async () => {
    const dia = await diaSimulado();
    const buscar = vi
      .fn<(f: { busca?: string }) => Promise<Resultado<DiaDaAgenda>>>()
      .mockImplementation(async (f) => ok(f.busca ? vazio(dia) : dia));
    const { container } = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(dia)} buscar={buscar} />);
    expect(buscar).not.toHaveBeenCalled(); // o primeiro dia veio do servidor

    await digitar("  Fulana  ");
    expect(buscar).toHaveBeenLastCalledWith({ busca: "Fulana" });
    expect(estadoDeDados(container)).toBe("sem-resultado");

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscar).toHaveBeenLastCalledWith({});
    expect(estadoDeDados(container)).toBe("pronto");
  });

  it("enquanto a busca não volta, a lista de antes fica na tela com aria-busy", async () => {
    const dia = await diaSimulado();
    let responder: (r: Resultado<DiaDaAgenda>) => void = () => {};
    const buscar = vi.fn(() => new Promise<Resultado<DiaDaAgenda>>((r) => (responder = r)));
    const { container } = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(dia)} buscar={buscar} />);
    await digitar("Juliana");
    expect(estadoDeDados(container)).toBe("pronto");
    expect(screen.getByRole("region", { name: textos.rotuloDaLista }).getAttribute("aria-busy")).toBe("true");
    await act(async () => responder(ok(dia)));
    expect(screen.getByRole("region", { name: textos.rotuloDaLista }).getAttribute("aria-busy")).toBeNull();
  });

  it("termo curto e CPF pela metade não buscam e explicam embaixo do campo; CPF inteiro busca", async () => {
    const dia = await diaSimulado();
    const buscar = vi.fn<(f: { busca?: string }) => Promise<Resultado<DiaDaAgenda>>>().mockResolvedValue(ok(dia));
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(dia)} buscar={buscar} />);
    for (const termo of ["j", "431.572", "4315728"]) {
      await digitar(termo);
      expect(buscar).not.toHaveBeenCalled();
      const campo = screen.getByRole("searchbox", { name: textos.busca.rotulo });
      expect(campo.getAttribute("aria-describedby")).toBeTruthy();
      expect(screen.getByText(textos.busca.termoCurto)).toBeDefined();
    }
    await digitar("431.572.801-20");
    expect(buscar).toHaveBeenLastCalledWith({ busca: "431.572.801-20" });
    expect(screen.queryByText(textos.busca.termoCurto)).toBeNull();
  });

  it("sem a data (falha no primeiro carregamento), o h1 mostra o nome do módulo", () => {
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={falha("INDISPONIVEL", "fora")} buscar={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(textos.titulo);
  });

  it("títulos de coluna no verde do ATTA-in (PDD §10)", async () => {
    render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(await diaSimulado())} buscar={vi.fn()} />);
    for (const th of screen.getAllByRole("columnheader")) expect(th.className).toContain("text-brand");
  });

  it("os cards filtram a lista pelo servidor; sem achado, limpar tira o filtro do card", async () => {
    const dia = await diaSimulado();
    const buscar = vi
      .fn<(f: { status?: string[]; semDocumento?: boolean }) => Promise<Resultado<DiaDaAgenda>>>()
      .mockImplementation(async (f) => ok(f.status || f.semDocumento ? vazio(dia) : dia));
    const { container } = render(<AgendaHoje resumoInicial={RESUMO} resumir={vi.fn()} buscarPeriodo={portaAgendaSimulada.periodo} buscarConcluidos={portaAgendaSimulada.concluidos} inicial={ok(dia)} buscar={buscar} />);

    fireEvent.click(screen.getByRole("button", { name: "Pronto: 1. Filtrar a lista" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscar).toHaveBeenLastCalledWith({ status: ["pronto"] });
    expect(estadoDeDados(container)).toBe("sem-resultado");

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscar).toHaveBeenLastCalledWith({});
    expect(screen.getByRole("button", { name: "Pronto: 1. Filtrar a lista" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Sem documento vinculado: 1. Filtrar a lista" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscar).toHaveBeenLastCalledWith({ semDocumento: true });
  });

  it("falha no resumo mostra o erro com tentar de novo só nos cards; a lista continua", async () => {
    const dia = await diaSimulado();
    const resumir = vi.fn().mockResolvedValue(RESUMO);
    render(<AgendaHoje inicial={ok(dia)} resumoInicial={falha("INDISPONIVEL", "fora")} resumir={resumir} buscar={vi.fn()} buscarPeriodo={vi.fn()} buscarConcluidos={vi.fn()} />);
    expect(screen.getByRole("region", { name: textos.rotuloDaLista })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await act(async () => {});
    expect(resumir).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: textos.cards.rotulo })).toBeDefined();
  });

  it("o segmento troca de visão: Todos com a coluna Data e o card Confirmação; Concluídos com Não realizado", async () => {
    const dia = await diaSimulado();
    const buscarPeriodo = vi.fn(portaAgendaSimulada.periodo);
    const buscarConcluidos = vi.fn(portaAgendaSimulada.concluidos);
    render(
      <AgendaHoje
        inicial={ok(dia)}
        resumoInicial={RESUMO}
        resumir={vi.fn()}
        buscar={vi.fn()}
        buscarPeriodo={buscarPeriodo}
        buscarConcluidos={buscarConcluidos}
      />,
    );
    const grupo = screen.getByRole("group", { name: textos.visoes.rotulo });
    expect(within(grupo).getByRole("button", { name: "Hoje" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(within(grupo).getByRole("button", { name: "Todos" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscarPeriodo).toHaveBeenCalledWith({});
    expect(screen.getByRole("columnheader", { name: /Data/ })).toBeDefined();
    expect(screen.getAllByText("Hoje").length).toBeGreaterThan(1); // a coluna Data diz "Hoje" nas linhas de hoje
    expect(screen.getByRole("heading", { name: "Confirmação" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Filtrar a lista/ })).toBeNull(); // filtros dos cards só na visão Hoje
    expect(screen.getByText(/\d+ agendamentos$/)).toBeDefined();

    fireEvent.click(within(grupo).getByRole("button", { name: "Concluídos" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(buscarConcluidos).toHaveBeenCalledWith({ periodo: "semana" });
    expect(screen.getByText("Não realizado")).toBeDefined();
    expect(screen.getAllByText("Realizado").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Check-in" })).toBeDefined();
    expect(screen.getByText(/registros? · atendimentos mais antigos ficam na Pasta do Paciente/)).toBeDefined();
  });
});
