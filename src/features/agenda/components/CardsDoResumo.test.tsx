import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ResumoDaAgenda } from "../schema";
import { textos } from "../textos";
import { CardsDoResumo } from "./CardsDoResumo";

// Cards do topo (PDD §10.2.2; simulador, captura 01). Números do banco; a tela só mostra e filtra.
const resumo: ResumoDaAgenda = {
  hojeFaltam: 5,
  hojeConcluidos: 1,
  mesConcluidos: 2,
  mesHorariosLivres: 175,
  checkin: { emPreenchimento: 1, pronto: 0, emAtendimento: 1 },
  confirmacao: { agendados: 6, aConfirmar: 2, confirmados: 4 },
  semDocumento: 1,
};

describe("cards do resumo", () => {
  it("mostra os 4 cards com os textos do PDD e do simulador", () => {
    render(<CardsDoResumo resumo={resumo} filtro={null} aoFiltrar={vi.fn()} />);
    const regiao = screen.getByRole("region", { name: textos.cards.rotulo });
    expect(within(regiao).getByText("Agendamentos hoje")).toBeDefined();
    expect(within(regiao).getByText("5")).toBeDefined();
    expect(within(regiao).getByText("1 concluído")).toBeDefined();
    expect(within(regiao).getByText("Agendamentos no mês")).toBeDefined();
    expect(within(regiao).getByText("concluídos no mês")).toBeDefined();
    expect(within(regiao).getByText("175")).toBeDefined();
    expect(within(regiao).getByText("horários livres na agenda")).toBeDefined();
    expect(within(regiao).getByRole("heading", { name: "Check-in" })).toBeDefined();
    expect(within(regiao).getByText("Vincule antes do horário")).toBeDefined();
  });

  it("concluídos no plural", () => {
    render(<CardsDoResumo resumo={{ ...resumo, hojeConcluidos: 3 }} filtro={null} aoFiltrar={vi.fn()} />);
    expect(screen.getByText("3 concluídos")).toBeDefined();
  });

  it("segmento do Check-in filtra pelo estado e, ativo, tira o filtro", () => {
    const aoFiltrar = vi.fn();
    const { rerender } = render(<CardsDoResumo resumo={resumo} filtro={null} aoFiltrar={aoFiltrar} />);
    const pronto = screen.getByRole("button", { name: "Pronto: 0. Filtrar a lista" });
    expect(pronto.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pronto);
    expect(aoFiltrar).toHaveBeenLastCalledWith({ tipo: "status", status: "pronto" });

    rerender(<CardsDoResumo resumo={resumo} filtro={{ tipo: "status", status: "pronto" }} aoFiltrar={aoFiltrar} />);
    const ativo = screen.getByRole("button", { name: "Pronto: 0. Filtrar a lista" });
    expect(ativo.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(ativo);
    expect(aoFiltrar).toHaveBeenLastCalledWith(null);
  });

  it("Sem documento liga e desliga o filtro", () => {
    const aoFiltrar = vi.fn();
    const { rerender } = render(<CardsDoResumo resumo={resumo} filtro={null} aoFiltrar={aoFiltrar} />);
    fireEvent.click(screen.getByRole("button", { name: "Sem documento vinculado: 1. Filtrar a lista" }));
    expect(aoFiltrar).toHaveBeenLastCalledWith({ tipo: "sem-documento" });
    rerender(<CardsDoResumo resumo={resumo} filtro={{ tipo: "sem-documento" }} aoFiltrar={aoFiltrar} />);
    const botao = screen.getByRole("button", { name: "Sem documento vinculado: 1. Filtrar a lista" });
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(botao);
    expect(aoFiltrar).toHaveBeenLastCalledWith(null);
  });

  it("Agendamentos hoje ainda não é botão (a visão Concluídos entra depois)", () => {
    render(<CardsDoResumo resumo={resumo} filtro={null} aoFiltrar={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(4); // 3 segmentos do Check-in + Sem documento
  });

  it("usa os breakpoints do tema (medium e large), não os do Tailwind, que o tema zera", () => {
    render(<CardsDoResumo resumo={resumo} filtro={null} aoFiltrar={vi.fn()} />);
    const grade = screen.getByRole("region", { name: textos.cards.rotulo }).className;
    expect(grade).toContain("medium:grid-cols-2");
    expect(grade).toContain("large:grid-cols-");
    expect(grade).not.toMatch(/\b(sm|md|lg|xl):/);
  });

  it("pressionado tem desenho próprio, diferente do anel de foco", () => {
    render(<CardsDoResumo resumo={resumo} filtro={{ tipo: "status", status: "pronto" }} aoFiltrar={vi.fn()} />);
    const ativo = screen.getByRole("button", { name: "Pronto: 0. Filtrar a lista" });
    expect(ativo.className).toContain("ring-inset");
    expect(ativo.className).not.toContain("ring-focus-ring");
  });

  it("sem leitura real (totais nulos), os números aparecem como —, sem inventar zero", () => {
    const nulo: ResumoDaAgenda = {
      hojeFaltam: null,
      hojeConcluidos: null,
      mesConcluidos: null,
      mesHorariosLivres: null,
      checkin: { emPreenchimento: null, pronto: null, emAtendimento: null },
      confirmacao: { agendados: null, aConfirmar: null, confirmados: null },
      semDocumento: null,
    };
    render(<CardsDoResumo resumo={nulo} filtro={null} aoFiltrar={vi.fn()} />);
    const regiao = screen.getByRole("region", { name: textos.cards.rotulo });
    expect(within(regiao).queryByText("0")).toBeNull();
    expect(within(regiao).getAllByText("—").length).toBeGreaterThanOrEqual(6);
    expect(screen.getByRole("button", { name: "Pronto: —. Filtrar a lista" })).toBeDefined();
  });
});
