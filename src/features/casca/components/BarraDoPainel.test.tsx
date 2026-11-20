import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessaoDoPainel } from "../sessao";
import { BarraDoPainel } from "./BarraDoPainel";

vi.mock("next/navigation", () => ({ usePathname: () => "/painel/configuracoes/agendamentos" }));

const sessao: SessaoDoPainel = { clinica: "Clínica Fictícia", pessoa: { nome: "Ana Exemplo" }, papel: "ADMIN", notificacoes: 3 };
const modulos = () => within(screen.getByRole("navigation", { name: "Módulos do painel" }));

describe("barra do painel (MIG-40)", () => {
  it("mostra a clínica, as abas com a ativa pela rota, o sino com o contador e a pessoa", () => {
    render(<BarraDoPainel sessao={sessao} />);
    expect(screen.getByText("Clínica Fictícia")).toBeInTheDocument();
    expect(modulos().getByRole("link", { name: "Configurações" })).toHaveAttribute("aria-current", "page");
    expect(modulos().getByRole("link", { name: "Agendamentos" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Notificações, 3 novas" })).toHaveAttribute("href", "/painel/notificacoes");
    expect(screen.getByText("Ana Exemplo")).toBeInTheDocument();
    expect(screen.getByText("AE")).toHaveAttribute("aria-hidden", "true");
  });

  it("Colaborador não vê Métricas nem Configurações", () => {
    render(<BarraDoPainel sessao={{ ...sessao, papel: "COLABORADOR" }} />);
    expect(modulos().getAllByRole("link").map((l) => l.textContent)).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA"]);
  });

  it("o monograma alterna a barra entre escura e clara, com o rótulo da próxima ação", async () => {
    render(<BarraDoPainel sessao={sessao} />);
    await userEvent.click(screen.getByRole("button", { name: "Deixar a barra clara" }));
    expect(screen.getByRole("button", { name: "Deixar a barra escura" })).toHaveAttribute("aria-pressed", "true");
  });

  it("contador da aba aparece só quando há número, com texto para leitor de tela", () => {
    render(<BarraDoPainel sessao={sessao} contadores={{ "/painel/agenda": 1 }} />);
    expect(modulos().getByRole("link", { name: /Agendamentos/ })).toHaveTextContent("1 pendente");
  });
});
