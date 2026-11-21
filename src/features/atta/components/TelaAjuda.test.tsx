import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { textosAjuda } from "../textos-ajuda";
import { TelaAjuda } from "./TelaAjuda";

describe("TelaAjuda (PDD §10.6.1, captura 19)", () => {
  it("lista os 7 guias do PDD, sem link nem botão sem destino", () => {
    render(<TelaAjuda />);
    const guias = screen.getByRole("region", { name: "Guias por módulo" });
    expect(guias.querySelectorAll("li")).toHaveLength(7);
    for (const nome of ["Métricas", "Agendamentos", "Pacientes", "Documentos", "Fluxo do Paciente", "Configurações", "Compliance e LGPD"])
      expect(screen.getByRole("heading", { level: 3, name: nome })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("o FAQ abre a resposta pelo teclado e não tem trecho 'a definir'", async () => {
    render(<TelaAjuda />);
    const primeira = textosAjuda.faq.itens[0]!;
    const pergunta = screen.getByText(primeira.p);
    expect(screen.getByText(primeira.r)).not.toBeVisible();
    await userEvent.click(pergunta);
    expect(screen.getByText(primeira.r)).toBeVisible();
    expect(screen.getByRole("region", { name: "FAQ" }).textContent).not.toMatch(/a definir/i);
  });

  it("a planilha modelo de pacientes só aparece com a URL da porta da importação (§10.1)", () => {
    const { rerender } = render(<TelaAjuda />);
    expect(screen.queryByRole("region", { name: "Planilha modelo de pacientes" })).toBeNull();
    rerender(<TelaAjuda planilha={{ url: "/modelos/planilha-de-pacientes.xlsx" }} />);
    const link = screen.getByRole("link", { name: "Baixar planilha modelo (.xlsx)" });
    expect(link).toHaveAttribute("href", "/modelos/planilha-de-pacientes.xlsx");
    expect(link).toHaveAttribute("download");
  });

  it("não há violação do axe", async () => {
    const { container } = render(<TelaAjuda />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
