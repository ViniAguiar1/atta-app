import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { PassoConcluido } from "./PassoConcluido";

// Passo 4 do PROpass (PDD §10.4.3): mini-explicação de como os documentos chegam e a divisão de responsabilidade
// declarada na própria tela (decisão da PO), com o conteúdo do PDD em frases curtas.
describe("PassoConcluido", () => {
  it("declara a divisão de responsabilidade da clínica, do profissional e da ATTA", () => {
    render(<PassoConcluido codigoAtta="ATTA-7K3M-Q9PX-2HDV" />);
    expect(screen.getByRole("heading", { level: 1, name: "PROpass concluído" })).toBeInTheDocument();
    const bloco = screen.getByRole("region", { name: "Quem cuida de quê depois do PROpass" });
    const itens = within(bloco).getAllByRole("listitem").map((li) => li.textContent);
    expect(itens).toEqual([
      "A clínica mantém os seus dados atualizados no sistema.",
      "Você avisa a clínica de qualquer mudança no seu e-mail, no seu telefone ou na situação do seu registro no conselho.",
      "A ATTA não responde pelo conteúdo clínico ou técnico dos documentos que você assina, nem pelo resumo do atendimento que você preenche.",
      "A ATTA também não responde por dado desatualizado informado por você ou pela clínica.",
    ]);
    expect(screen.getByText(/não tem login nem painel/)).toBeInTheDocument(); // a mini-explicação continua
    // o Código ATTA do Termo, com o link para a verificação pública (§18)
    expect(screen.getByRole("region", { name: "Código ATTA do seu Termo de Autorização" })).toHaveTextContent("ATTA-7K3M-Q9PX-2HDV");
    expect(screen.getByRole("link", { name: "Conferir na verificação pública" })).toHaveAttribute("href", "/verificar/ATTA-7K3M-Q9PX-2HDV");
  });

  it("quem já tem a senha vê o lembrete; sem violação do axe", async () => {
    const { container } = render(<PassoConcluido codigoAtta="ATTA-7K3M-Q9PX-2HDV" senhaExistente />);
    expect(screen.getByText("Use a mesma senha de 4 números que você já usa no Boarding Check.")).toBeInTheDocument();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
