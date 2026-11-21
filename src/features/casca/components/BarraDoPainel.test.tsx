import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessaoDoPainel } from "../sessao";
import { BarraDoPainel as Barra } from "./BarraDoPainel";

const acaoSair = vi.fn(async () => {});
const BarraDoPainel = (p: Omit<React.ComponentProps<typeof Barra>, "acaoSair">) => <Barra acaoSair={acaoSair} {...p} />;

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
    expect(screen.getByRole("button", { name: "Menu de Ana Exemplo" })).toBeInTheDocument();
    expect(screen.getByText("AE")).toHaveAttribute("aria-hidden", "true");
  });

  it("como o simulador (print 28): as 6 abas para o ADMIN, com o separador antes de Métricas, e o nome da pessoa", () => {
    render(<BarraDoPainel sessao={sessao} />);
    expect(modulos().getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Agendamentos",
      "Pacientes",
      "Termos & Docs",
      "ATTA",
      "Métricas",
      "Configurações",
    ]);
    expect(modulos().getByRole("link", { name: "ATTA" }).className).toContain("font-atta");
    expect(screen.getByText("Ana Exemplo")).toHaveAttribute("aria-hidden", "true"); // o rótulo do botão já diz o nome
  });

  it("cores do simulador na barra escura: aba ativa em brand-active com texto branco 600, inativas a 78 %", () => {
    render(<BarraDoPainel sessao={sessao} />);
    expect(modulos().getByRole("link", { name: "Configurações" }).className).toMatch(/\bbg-brand-active\b.*\bfont-semibold\b.*\btext-on-brand\b/);
    expect(modulos().getByRole("link", { name: "Agendamentos" }).className).toContain("text-on-brand/78");
    expect(screen.getByRole("banner").className).toContain("bg-brand");
  });

  it("medidas do print 28: abas em 14 px, o ATTA na font-atta em 12 px, a clínica em 16 px e a pessoa em 13 px", () => {
    render(<BarraDoPainel sessao={sessao} />);
    const atta = modulos().getByRole("link", { name: "ATTA" }).className;
    expect(atta).toMatch(/\bfont-atta\b/);
    expect(atta).toMatch(/\btext-xs\b/);
    expect(atta).not.toMatch(/\btext-sm\b/); // um tamanho só: duas classes de fonte disputariam pela ordem do CSS
    expect(modulos().getByRole("link", { name: "Pacientes" }).className).toMatch(/\btext-sm\b/);
    expect(screen.getByText("Clínica Fictícia").className).toMatch(/\bfont-title\b.*\btext-base\b/);
    expect(screen.getByText("Ana Exemplo").className).toMatch(/\btext-corpo\b/);
  });

  it("no celular, a linha das abas rola até a aba atual sem rolar a página", () => {
    const largura = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(700);
    const visivel = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
    const caixa = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const r = (left: number, width: number) => ({ left, width, right: left + width, top: 0, bottom: 44, height: 44, x: left, y: 0, toJSON: () => ({}) });
      if (this.tagName === "NAV") return r(0, 390) as DOMRect;
      if (this.getAttribute("aria-current") === "page") return r(560, 120) as DOMRect; // Configurações, fora da área visível
      return r(0, 0) as DOMRect;
    });
    try {
      render(<BarraDoPainel sessao={sessao} />);
      // centrada: 560 − 0 − (390 − 120) / 2 = 425
      expect(screen.getByRole("navigation", { name: "Módulos do painel" }).scrollLeft).toBe(425);
    } finally {
      largura.mockRestore();
      visivel.mockRestore();
      caixa.mockRestore();
    }
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

  it("o sino aparece sempre, e sem nome de clínica não sobra texto vazio", () => {
    render(<BarraDoPainel sessao={{ ...sessao, clinica: null, notificacoes: 0 }} />);
    expect(screen.getByRole("link", { name: "Notificações" })).toHaveAttribute("href", "/painel/notificacoes");
    expect(screen.queryByTitle("Clínica Fictícia")).toBeNull();
  });

  it("o menu da pessoa abre com Sair / trocar usuário e fecha no Esc, com o foco de volta", async () => {
    render(<BarraDoPainel sessao={sessao} />);
    const menu = screen.getByRole("button", { name: "Menu de Ana Exemplo" });
    expect(screen.queryByRole("button", { name: "Sair / trocar usuário" })).toBeNull();
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Sair / trocar usuário" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("Tab para fora do menu fecha o painel", async () => {
    render(<BarraDoPainel sessao={sessao} />);
    const menu = screen.getByRole("button", { name: "Menu de Ana Exemplo" });
    await userEvent.click(menu);
    await userEvent.tab(); // vai para "Sair / trocar usuário"
    expect(screen.getByRole("button", { name: "Sair / trocar usuário" })).toHaveFocus();
    await userEvent.tab(); // sai do menu
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("contador da aba aparece só quando há número, com texto para leitor de tela", () => {
    render(<BarraDoPainel sessao={sessao} contadores={{ "/painel/agenda": 1 }} />);
    expect(modulos().getByRole("link", { name: /Agendamentos/ })).toHaveTextContent("1 pendente");
  });
});
