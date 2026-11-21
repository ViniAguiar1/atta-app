import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resumoDe } from "@/server/documentos/real";
import { MODELOS_SIMULADOS } from "@/server/documentos/simulado";
import { ModelosDeDocumento } from "./ModelosDeDocumento";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);
const pronto = (modelos = MODELOS_SIMULADOS) => ({ ok: true as const, data: { modelos, resumo: resumoDe(modelos) } });

describe("Termos & Docs › Modelos de documento", () => {
  it("cartões com o que tem fonte e \"—\" no resto", () => {
    render(<ModelosDeDocumento resultado={pronto()} />);
    const cards = screen.getByRole("region", { name: "Resumo dos modelos" });
    expect(within(cards).getByText("Termos ativos")).toBeInTheDocument();
    expect(within(cards).getAllByText("—").length).toBeGreaterThanOrEqual(2); // vencendo e assinados sem fonte
    expect(within(cards).getByText("1 obrigatório(s) · 0 opcional(is)")).toBeInTheDocument();
    expect(within(cards).getByText("— vencido(s) para reassinar")).toBeInTheDocument();
    expect(within(cards).getByText("— com ATTA Sign")).toBeInTheDocument();
  });

  it("as 3 subabas do simulador, com Modelos de documento ativa", () => {
    render(<ModelosDeDocumento resultado={pronto()} />);
    const nav = screen.getByRole("navigation", { name: "Seções de Termos & Docs" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Modelos de documento", "Formulários de Saúde", "Banco de Perguntas"]);
    expect(within(nav).getByRole("link", { name: "Modelos de documento" })).toHaveAttribute("aria-current", "page");
  });

  it("tabela com as colunas do simulador, sem os inativos, e rodapé com mostrados de todos", () => {
    render(<ModelosDeDocumento resultado={pronto()} />);
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
      "Modelo", "Procedimentos", "Frequência", "Recusa impede?", "Versão", "Assinados",
    ]);
    expect(within(tabela).getByText("TCLE — Toxina botulínica")).toBeInTheDocument();
    expect(within(tabela).getByText("Toxina botulínica")).toBeInTheDocument();
    expect(within(tabela).getByText("+1")).toBeInTheDocument();
    expect(within(tabela).getByText("Sim · obrigatório")).toBeInTheDocument();
    expect(within(tabela).getByText("desde 11/08/2026")).toBeInTheDocument();
    expect(within(tabela).getByText("Única · 12 meses")).toBeInTheDocument();
    expect(within(tabela).getByText("Rascunho")).toBeInTheDocument();
    expect(within(tabela).queryByText("Uso de imagem (2025)")).toBeNull(); // inativo fica fora da lista padrão
    expect(screen.getByText("2 de 3 modelo(s)")).toBeInTheDocument();
  });

  it("sem modelo, o estado vazio; com erro, o tentar de novo", () => {
    render(<ModelosDeDocumento resultado={pronto([])} />);
    expect(screen.getByText("Nenhum modelo de documento ainda")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    cleanup();
    render(<ModelosDeDocumento resultado={{ ok: false, error: { code: "INDISPONIVEL", message: "x" } }} />);
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it("sem o nome do Serviço, o chip conta os procedimentos", () => {
    const [ativo] = MODELOS_SIMULADOS;
    render(<ModelosDeDocumento resultado={pronto([{ ...ativo!, procedimentos: [{ id: "x", nome: null }, { id: "y", nome: null }] }])} />);
    expect(screen.getByText("2 procedimento(s)")).toBeInTheDocument();
  });
});
