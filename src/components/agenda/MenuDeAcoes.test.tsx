import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MenuDeAcoes } from "./MenuDeAcoes";

// Menu ⋮ das ações (PDD §10.2.2; captura 32), padrão disclosure. Quais ações e o motivo da desabilitada vêm do banco.
const itens = [
  { acao: "confirmar" as const, desabilitadaPor: "fora_da_janela" },
  { acao: "marcar_ausente" as const },
  { acao: "cancelar" as const },
];

function abrir() {
  const botao = screen.getByRole("button", { name: "Ações de Mariana Costa Albuquerque" });
  fireEvent.click(botao);
  return botao;
}

describe("MenuDeAcoes", () => {
  it("o ⋮ abre e fecha o menu com aria-expanded e aria-controls", () => {
    render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={vi.fn()} />);
    const botao = abrir();
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById(botao.getAttribute("aria-controls") ?? "");
    expect(menu).not.toBeNull();
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("Esc fecha e devolve o foco ao ⋮; clique fora também fecha", () => {
    render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={vi.fn()} />);
    const botao = abrir();
    fireEvent.keyDown(screen.getByRole("button", { name: "Marcar como ausente" }), { key: "Escape" });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(botao);
    abrir();
    fireEvent.mouseDown(document.body);
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("o Tab que sai do menu fecha", () => {
    render(
      <>
        <MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={vi.fn()} />
        <button type="button">depois</button>
      </>,
    );
    const botao = abrir();
    fireEvent.blur(screen.getByRole("button", { name: "Cancelar agendamento" }), {
      relatedTarget: screen.getByRole("button", { name: "depois" }),
    });
    expect(botao.getAttribute("aria-expanded")).toBe("false");
  });

  it("a ação desabilitada tem aria-disabled e o motivo, e não dispara nada", () => {
    const aoEscolher = vi.fn();
    render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={aoEscolher} />);
    abrir();
    const confirmar = screen.getByRole("button", { name: "Confirmar agendamento" });
    expect(confirmar.getAttribute("aria-disabled")).toBe("true");
    const motivo = document.getElementById(confirmar.getAttribute("aria-describedby") ?? "");
    expect(motivo?.textContent).toBe("Disponível só dentro da janela de confirmação");
    fireEvent.click(confirmar);
    expect(aoEscolher).not.toHaveBeenCalled();
  });

  it("escolher fecha o menu, devolve o foco e avisa a ação", () => {
    const aoEscolher = vi.fn();
    render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={aoEscolher} />);
    const botao = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Marcar como ausente" }));
    expect(aoEscolher).toHaveBeenCalledWith("marcar_ausente");
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(botao);
  });

  it("Cancelar fica por último, separado; sem itens, não há ⋮", () => {
    const { unmount } = render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={vi.fn()} />);
    const botao = abrir();
    const menu = document.getElementById(botao.getAttribute("aria-controls") ?? "") as HTMLElement;
    const nomes = within(menu).getAllByRole("button").map((b) => b.textContent);
    expect(nomes.at(-1)).toBe("Cancelar agendamento");
    expect(menu.querySelector("hr")).not.toBeNull();
    unmount();
    render(<MenuDeAcoes itens={[]} paciente="X" aoEscolher={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("o ⋮ tem alvo de 44 px no celular e 36 px a partir de medium (regra dos padrões)", () => {
    render(<MenuDeAcoes itens={itens} paciente="Mariana Costa Albuquerque" aoEscolher={vi.fn()} />);
    const botao = screen.getByRole("button", { name: "Ações de Mariana Costa Albuquerque" });
    expect(botao.className).toContain("size-11");
    expect(botao.className).toContain("medium:size-9");
  });
});
