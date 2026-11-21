import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { PAINEL_VAZIO, type PainelDeMetricas as Dados } from "../schema";
import { PainelDeMetricas } from "./PainelDeMetricas";

const CHEIO: Dados = {
  atendimentosValidosHoje: 3,
  tempoMedioCheckin: { mediaSegundos: 207, hojeSegundos: 150 },
  tempoOperacionalSalvoHoras: 156,
  atendimentosExtrasMes: 213,
  documentosAssinadosMes: 665,
  formulariosDeSaudeMes: 433,
  preparacaoPrevia: { prontos: 2, total: 2 },
  temposDeHoje: { checkinSegundos: 150, recepcaoSegundos: null, medianaSegundos: 150, p90Segundos: 174 },
};

describe("Painel de Métricas (MIG-46)", () => {
  it("com números: os 4 cards formatados como a captura 40, a preparação e os tempos de hoje", async () => {
    const { container } = render(<PainelDeMetricas dados={CHEIO} />);
    expect(screen.getByRole("note")).toHaveTextContent("Mede a eficiência do check-in, nunca o desempenho clínico.");
    expect(screen.getByText("3 atendimento(s) válido(s) hoje")).toBeInTheDocument();
    const cards = within(screen.getByRole("region", { name: "Indicadores do mês" }));
    expect(cards.getByText("3m 27s")).toBeInTheDocument();
    expect(cards.getByText("hoje 2m 30s · média de 30 dias")).toBeInTheDocument();
    expect(cards.getByText("156 h")).toBeInTheDocument();
    expect(cards.getByText("+213")).toBeInTheDocument();
    expect(cards.getByText("665")).toBeInTheDocument();
    expect(cards.getByText("no mês · 433 Formulários de Saúde")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("2 de 2 atendimentos de hoje chegaram com o check-in pronto")).toBeInTheDocument();
    expect(screen.getByText("p90 2m 54s")).toBeInTheDocument();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });

  it("sem dados (produção até o MIG-16): '—' em todo número, nada inventado, e os gráficos no estado vazio", async () => {
    const { container } = render(<PainelDeMetricas dados={PAINEL_VAZIO} />);
    expect(screen.queryByText(/válido\(s\) hoje/)).toBeNull();
    const cards = within(screen.getByRole("region", { name: "Indicadores do mês" }));
    expect(cards.getAllByText("—")).toHaveLength(4);
    expect(cards.getByText("média de 30 dias")).toBeInTheDocument();
    expect(cards.getByText("no mês")).toBeInTheDocument();
    expect(screen.getByText("Nenhum atendimento hoje ainda.")).toBeInTheDocument();
    expect(screen.getByText("p90 —")).toBeInTheDocument();
    expect(screen.getAllByText("Ainda não há atendimentos suficientes para o gráfico.")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/\d+m \d+s|\d+ h\b|\+\d/);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
