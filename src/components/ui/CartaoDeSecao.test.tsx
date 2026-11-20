import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "./axe-de-teste";
import { CartaoDeSecao } from "./CartaoDeSecao";

describe("CartaoDeSecao", () => {
  it("é uma seção nomeada pelo título (h2 por padrão), com subtítulo, texto e conteúdo", () => {
    render(
      <CartaoDeSecao titulo="Próximo produto" subtitulo="O que vem depois do ATTA-in." icone="📋" texto="Um parágrafo.">
        <p>Conteúdo</p>
      </CartaoDeSecao>,
    );
    const secao = screen.getByRole("region", { name: "Próximo produto" });
    expect(screen.getByRole("heading", { level: 2, name: "Próximo produto" })).toBeInTheDocument();
    expect(secao).toHaveTextContent("O que vem depois do ATTA-in.");
    expect(secao).toHaveTextContent("Um parágrafo.");
    expect(secao).toHaveTextContent("Conteúdo");
  });

  it("aceita o título em h3 e a ação à direita do cabeçalho", () => {
    render(<CartaoDeSecao titulo="Diagnóstico" icone="🩺" nivel={3} acao={<button type="button">Rodar diagnóstico</button>} />);
    expect(screen.getByRole("heading", { level: 3, name: "Diagnóstico" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rodar diagnóstico" }).closest("header")).not.toBeNull();
  });

  it("o ícone é decorativo; sem corpo, o cabeçalho não leva a linha de baixo", () => {
    const { container } = render(<CartaoDeSecao titulo="Só cabeçalho" icone="💡" />);
    expect(container.querySelector("header > span")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("header")?.className).not.toContain("border-b");
  });

  it("semPreenchimento tira o padding do corpo", () => {
    const { container } = render(
      <CartaoDeSecao titulo="Tabela" icone="📋" semPreenchimento>
        <table aria-label="t" />
      </CartaoDeSecao>,
    );
    expect(container.querySelector("table")?.parentElement?.className).toBe("");
  });

  it("não há violação do axe", async () => {
    const { container } = render(
      <CartaoDeSecao titulo="Transparência de dados armazenados" subtitulo="Quatro categorias." icone="🔍" acao={<button type="button">Ação</button>}>
        <p>Corpo</p>
      </CartaoDeSecao>,
    );
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
