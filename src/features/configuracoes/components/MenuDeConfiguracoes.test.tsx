import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuDeConfiguracoes } from "./MenuDeConfiguracoes";

vi.mock("next/navigation", () => ({ usePathname: () => "/painel/configuracoes/agendamentos" }));

const GRUPOS = [
  {
    titulo: "Agendamentos",
    secoes: [
      { caminho: "agendamentos", titulo: "Agendamentos", exibir: "fora-da-producao" as const },
      { caminho: "integracoes", titulo: "Integrações", exibir: "sempre" as const },
    ],
  },
];

describe("menu lateral de Configurações", () => {
  it("mostra os grupos recebidos, com a seção atual marcada", () => {
    render(<MenuDeConfiguracoes grupos={GRUPOS} />);
    const menu = screen.getByRole("navigation", { name: "Seções de Configurações" });
    expect(within(menu).getByRole("list", { name: "Agendamentos" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Agendamentos" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Integrações" })).toHaveAttribute("href", "/painel/configuracoes/integracoes");
  });

  it("no celular, o botão abre e fecha a lista", async () => {
    render(<MenuDeConfiguracoes grupos={GRUPOS} />);
    await userEvent.click(screen.getByRole("button", { name: "Ver seções" }));
    expect(screen.getByRole("button", { name: "Fechar seções" })).toHaveAttribute("aria-expanded", "true");
  });
});
