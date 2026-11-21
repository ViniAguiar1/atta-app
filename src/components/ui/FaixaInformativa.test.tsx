import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "./axe-de-teste";
import { FaixaInformativa } from "./FaixaInformativa";

describe("FaixaInformativa", () => {
  it("é uma nota, com o destaque em negrito antes do texto", () => {
    render(<FaixaInformativa destaque="Central de Ajuda.">Guias por módulo e respostas.</FaixaInformativa>);
    const nota = screen.getByRole("note");
    expect(nota.textContent).toBe("Central de Ajuda. Guias por módulo e respostas.");
    expect(screen.getByText("Central de Ajuda.").tagName).toBe("STRONG");
  });

  it("sem destaque, só o texto", () => {
    render(<FaixaInformativa>Só o texto.</FaixaInformativa>);
    expect(screen.getByRole("note").textContent).toBe("Só o texto.");
    expect(screen.getByRole("note").querySelector("strong")).toBeNull();
  });

  it("o tom neutro (Configurações) troca fundo, borda e espaçamento; o padrão continua o info", () => {
    const { rerender } = render(<FaixaInformativa>Texto.</FaixaInformativa>);
    expect(screen.getByRole("note").className).toContain("bg-(--faixa-info-bg)");
    expect(screen.getByRole("note").className).toContain("py-2.5");
    rerender(<FaixaInformativa tom="neutro">Texto.</FaixaInformativa>);
    const nota = screen.getByRole("note");
    expect(nota.className).toContain("bg-surface-raised");
    expect(nota.className).toContain("border-l-(--faixa-neutra-borda)");
    expect(nota.className).toContain("py-1.5");
    expect(nota.className).toContain("text-corpo");
  });

  it("o ícone é decorativo e não há violação do axe", async () => {
    const { container } = render(<FaixaInformativa destaque="Em breve:">o ATTA me chega para o paciente.</FaixaInformativa>);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
