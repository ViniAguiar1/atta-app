import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Subabas } from "@/components/ui/Subabas";
import { CascaDoPainel } from "./CascaDoPainel";

const RAIZ = join(__dirname, "..", "..", "..", "..");

describe("casca do painel (MIG-40)", () => {
  it("o espaço da barra à tela fica na casca: 16 px em cima, 20 px dos lados, e zero quando a tela abre com subabas", () => {
    render(
      <CascaDoPainel barra={<header>barra</header>}>
        <Subabas rotulo="Seções" itens={[{ rotulo: "Pacientes", href: "/painel/pacientes" }]} ativa="/painel/pacientes" />
      </CascaDoPainel>,
    );
    const main = screen.getByRole("main");
    expect(main.className).toMatch(/\bpt-4\b/);
    expect(main.className).toContain("medium:px-5");
    expect(main.className).toContain("has-[[data-subabas]]:pt-0");
    // a linha das subabas sai da borda esquerda; a primeira subaba fica alinhada ao conteúdo
    expect(main.className).toContain("medium:[&_[data-subabas]]:-ml-5");
    expect(main.className).toContain("medium:[&_[data-subabas]]:pl-5");
    expect(screen.getByRole("navigation", { name: "Seções" })).toHaveAttribute("data-subabas");
  });

  it("não lê a rota: usePathname fora de Suspense quebraria o build das rotas dinâmicas do painel (cacheComponents)", () => {
    const codigo = readFileSync(join(RAIZ, "src/features/casca/components/CascaDoPainel.tsx"), "utf8");
    expect(codigo).not.toMatch(/from ["']next\/navigation["']/);
    expect(codigo).not.toMatch(/^["']use client["']/m);
  });

  it("a tela do 2º fator fica noutro grupo de rota, fora da casca, com a mesma URL", () => {
    expect(existsSync(join(RAIZ, "src/app/(segundo-fator)/painel/seguranca/2fa/page.tsx"))).toBe(true);
    expect(existsSync(join(RAIZ, "src/app/(clinica)/painel/seguranca"))).toBe(false);
  });
});
