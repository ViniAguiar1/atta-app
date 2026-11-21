import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import type { ResumoDosDados } from "@/server/atta/porta";
import { TelaPrivacidade } from "./TelaPrivacidade";

const nulo: ResumoDosDados = {
  membros: null,
  procedimentos: null,
  modelos: null,
  pacientes: null,
  documentosAssinados: null,
  respostasDeSaude: null,
  registrosDeAuditoria: null,
  requisicoesDeTitular: null,
  requisicoesEmAberto: null,
};

describe("TelaPrivacidade (PDD §10.6.3, captura 21)", () => {
  it("põe o nome da clínica da sessão na faixa de controlador × operador", () => {
    render(<TelaPrivacidade clinica="Clínica Exemplo" resumo={nulo} />);
    expect(screen.getByRole("note")).toHaveTextContent("Controlador × operador: a clínica (Clínica Exemplo) é controladora");
  });

  it("sem dado, mostra — nos números, nunca 0 inventado", () => {
    render(<TelaPrivacidade clinica={null} resumo={nulo} />);
    const transparencia = screen.getByRole("region", { name: "Transparência de dados armazenados" });
    expect(transparencia).toHaveTextContent("— membros · — procedimentos · — modelos");
    expect(transparencia).toHaveTextContent("— pacientes · — documentos assinados");
    expect(transparencia).toHaveTextContent("— respostas de saúde");
    expect(screen.getByText("— em aberto")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("a clínica é controladora");
  });

  it("com dado real, mostra os números da clínica, no singular quando é 1", () => {
    render(<TelaPrivacidade clinica={null} resumo={{ ...nulo, membros: 1, procedimentos: 5, modelos: 0, pacientes: 12 }} />);
    const transparencia = screen.getByRole("region", { name: "Transparência de dados armazenados" });
    expect(transparencia).toHaveTextContent("1 membro · 5 procedimentos · 0 modelos");
    expect(transparencia).toHaveTextContent("12 pacientes · — documentos assinados");
  });

  it("os prazos de guarda são os do PDD (a guarda de 20 anos é obrigação da clínica) e não há toggle de consentimento", () => {
    render(<TelaPrivacidade clinica={null} resumo={nulo} />);
    const tabela = screen.getByRole("table", { name: "Prazos de guarda legal" });
    expect(within(tabela).getAllByRole("row")).toHaveLength(5);
    expect(tabela).toHaveTextContent("é obrigação da clínica, que exporta o acervo ao cancelar");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("region", { name: "Políticas de consentimento" })).toHaveTextContent("Configurações › Termos & Políticas");
  });

  it("não há botão sem destino nem violação do axe", async () => {
    const { container } = render(<TelaPrivacidade clinica="Clínica Exemplo" resumo={nulo} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
