import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Subabas } from "./Subabas";

const itens = [
  { rotulo: "Pacientes", href: "/painel/pacientes" },
  { rotulo: "Pasta do Paciente", href: "/painel/pacientes/pasta" },
];

describe("Subabas", () => {
  it("é uma navegação com nome, e só a ativa tem aria-current e o sublinhado da marca", () => {
    render(<Subabas rotulo="Seções de Pacientes" itens={itens} ativa="/painel/pacientes" />);
    const nav = screen.getByRole("navigation", { name: "Seções de Pacientes" });
    const ativa = screen.getByRole("link", { name: "Pacientes" });
    const outra = screen.getByRole("link", { name: "Pasta do Paciente" });
    expect(nav).toContainElement(ativa);
    expect(ativa).toHaveAttribute("aria-current", "page");
    expect(ativa.className).toMatch(/\bborder-brand\b.*\bfont-semibold\b/);
    expect(outra).not.toHaveAttribute("aria-current");
    expect(outra).toHaveAttribute("href", "/painel/pacientes/pasta");
    expect(outra.className).toContain("border-transparent");
  });

  it("alvo de toque de 44 px, rótulo sem quebra e rolagem lateral só na lista (as 5 do ATTA em 390 px)", () => {
    render(<Subabas rotulo="Seções" itens={itens} ativa="/painel/pacientes" />);
    expect(screen.getByRole("list").className).toContain("overflow-x-auto");
    for (const link of screen.getAllByRole("link")) expect(link.className).toMatch(/\bmin-h-11\b.*\bwhitespace-nowrap\b/);
  });
});
