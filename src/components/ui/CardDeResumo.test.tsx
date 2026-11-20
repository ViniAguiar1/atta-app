import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CardDeResumo } from "./CardDeResumo";

const Icone = () => <svg data-testid="icone" />;

describe("CardDeResumo", () => {
  it("número, rótulo em versalete por CSS (texto normal no HTML), ícone decorativo e legenda", () => {
    render(<CardDeResumo valor={18} rotulo="Pacientes" icone={<Icone />} legenda="6 com atendimento hoje" />);
    expect(screen.getByText("18")).toBeInTheDocument();
    const rotulo = screen.getByText("Pacientes");
    expect(rotulo.className).toContain("uppercase");
    expect(screen.getByTestId("icone").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("6 com atendimento hoje")).toBeInTheDocument();
  });

  it("sem número, mostra o travessão, nunca um valor inventado", () => {
    render(<CardDeResumo valor={null} rotulo="Retorno" icone={<Icone />} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("tom do quadradinho: neutro por padrão, marca e negativo; destaque negativo pinta número e quadradinho", () => {
    const { rerender } = render(<CardDeResumo valor={1} rotulo="X" icone={<Icone />} />);
    expect(screen.getByTestId("icone").parentElement!.className).toContain("bg-surface-card");
    rerender(<CardDeResumo valor={1} rotulo="X" icone={<Icone />} tom="marca" />);
    expect(screen.getByTestId("icone").parentElement!.className).toContain("bg-brand/10");
    rerender(<CardDeResumo valor={1} rotulo="X" icone={<Icone />} destaque="negativo" />);
    expect(screen.getByTestId("icone").parentElement!.className).toContain("bg-status-negative/10");
    expect(screen.getByText("1").className).toContain("text-status-negative");
  });

  it("legenda aceita mais de uma linha", () => {
    render(
      <CardDeResumo valor={2} rotulo="Agendamentos no mês" icone={<Icone />}
        legenda={<><span>concluídos no mês</span><span><b>175</b> horários livres na agenda</span></>} />,
    );
    expect(screen.getByText("concluídos no mês")).toBeInTheDocument();
    expect(screen.getByText("175")).toBeInTheDocument();
  });

  it("com filtro, o card é um botão com aria-pressed e rótulo falado, que liga e desliga", async () => {
    const aoAlternar = vi.fn();
    const { rerender } = render(
      <CardDeResumo valor={1} rotulo="Sem documento vinculado" icone={<Icone />} destaque="negativo"
        filtro={{ pressionado: false, aoAlternar, rotuloFalado: "Sem documento vinculado: 1. Filtrar a lista" }} />,
    );
    const botao = screen.getByRole("button", { name: "Sem documento vinculado: 1. Filtrar a lista" });
    expect(botao).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(botao);
    expect(aoAlternar).toHaveBeenCalledOnce();
    rerender(
      <CardDeResumo valor={1} rotulo="Sem documento vinculado" icone={<Icone />} destaque="negativo"
        filtro={{ pressionado: true, aoAlternar, rotuloFalado: "Sem documento vinculado: 1. Filtrar a lista" }} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button").className).toContain("ring-status-negative");
  });
});
