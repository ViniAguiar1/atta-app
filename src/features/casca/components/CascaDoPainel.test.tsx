import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Subabas } from "@/components/ui/Subabas";
import { CascaDoPainel } from "./CascaDoPainel";

let caminho = "/painel/pacientes";
vi.mock("next/navigation", () => ({ usePathname: () => caminho }));

describe("casca do painel (MIG-40)", () => {
  it("o espaço da barra à tela fica na casca: 16 px em cima, 20 px dos lados, e zero quando a tela abre com subabas", () => {
    caminho = "/painel/pacientes";
    render(
      <CascaDoPainel barra={<header>barra</header>}>
        <Subabas rotulo="Seções" itens={[{ rotulo: "Pacientes", href: "/painel/pacientes" }]} ativa="/painel/pacientes" />
      </CascaDoPainel>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/\bpt-4\b/);
    expect(main.className).toContain("medium:px-5");
    expect(main.className).toContain("has-[[data-subabas]]:pt-0");
    expect(screen.getByRole("navigation", { name: "Seções" })).toHaveAttribute("data-subabas");
  });

  it("em /painel/seguranca a tela vem sem a barra e sem o main da casca", () => {
    caminho = "/painel/seguranca";
    render(
      <CascaDoPainel barra={<header>barra</header>}>
        <p>segundo fator</p>
      </CascaDoPainel>,
    );
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.queryByText("barra")).toBeNull();
  });
});
