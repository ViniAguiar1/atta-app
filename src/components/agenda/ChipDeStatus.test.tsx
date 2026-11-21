import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STATUS } from "@/lib/agenda/linha";
import { ChipDeStatus, SeloAtrasado } from "./ChipDeStatus";
import { textosDaAgenda } from "./textos";

// Componente de domínio comum à Agenda e à Pasta (PDD §10.2.2): os 7 estados com o texto do PDD, o rótulo trocado
// ("Não realizado" nos Concluídos) sem mudar a cor, e o selo Atrasado, que não é estado.
describe("ChipDeStatus", () => {
  it("mostra o texto do PDD de cada um dos 7 estados", () => {
    for (const status of STATUS) {
      const { unmount } = render(<ChipDeStatus status={status} />);
      const chip = screen.getByText(textosDaAgenda.status[status]);
      expect(chip.getAttribute("data-status")).toBe(status);
      unmount();
    }
  });

  it("rótulo troca só o texto; a cor segue o estado", () => {
    const { container } = render(<ChipDeStatus status="ausente" rotulo="Não realizado" />);
    expect(screen.getByText("Não realizado").getAttribute("data-status")).toBe("ausente");
    expect(container.querySelector('[data-status="ausente"]')?.className).toContain("border-border-functional");
  });

  it("o selo Atrasado é um selo, não um estado", () => {
    render(<SeloAtrasado />);
    const selo = screen.getByText("Atrasado");
    expect(selo.getAttribute("data-selo")).toBe("atrasado");
    expect(selo.getAttribute("data-status")).toBeNull();
  });
});
