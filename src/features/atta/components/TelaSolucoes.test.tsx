import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { TelaSolucoes } from "./TelaSolucoes";

describe("TelaSolucoes (PDD §10.6.5, captura 23)", () => {
  it("mostra a faixa Em breve e o card do ATTA me, sem botões sem destino", async () => {
    const { container } = render(<TelaSolucoes />);
    expect(screen.getByRole("note")).toHaveTextContent("Em breve: o ATTA me chega para o paciente");
    const proximo = screen.getByRole("region", { name: "Próximo produto" });
    expect(proximo).toHaveTextContent("ATTA me");
    expect(proximo).toHaveTextContent("Em breve");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
