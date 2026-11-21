import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Pergunta, Resposta } from "@/lib/saude/schema";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { RespostasDoFormulario } from "./RespostasDoFormulario";

// Perguntas e respostas inventadas.
const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const PERGUNTAS: Pergunta[] = [
  {
    id: id(1),
    texto: "Possui alguma alergia?",
    tipo: "sim_nao",
    obrigatoria: true,
    subOpcoes: { quando: "sim", opcoes: [{ id: "latex", rotulo: "Látex" }], permiteDigitar: true },
  },
  { id: id(2), texto: "Qual a reação?", tipo: "aberta", obrigatoria: false, condicao: { perguntaId: id(1), resposta: "sim" } },
  { id: id(3), texto: "Usa medicamento contínuo?", tipo: "sim_nao", obrigatoria: true },
  { id: id(4), texto: "Já fez algum destes?", tipo: "opcoes", obrigatoria: false, opcoes: [{ id: "laser", rotulo: "Laser" }], permiteOutro: true },
  { id: id(5), texto: "Pratica atividade física?", tipo: "sim_nao", obrigatoria: false, condicao: { perguntaId: id(3), resposta: "sim" } },
];
const RESPOSTAS: Resposta[] = [
  { perguntaId: id(1), recusada: false, valor: { tipo: "sim_nao", valor: true, subOpcoes: ["latex"], digitadas: ["Esparadrapo"] } },
  { perguntaId: id(2), recusada: false, valor: { tipo: "aberta", texto: "Coceira leve." } },
  { perguntaId: id(3), recusada: true },
  { perguntaId: id(4), recusada: false, valor: { tipo: "opcoes", valores: ["laser"], outro: "Microagulhamento" } },
];

describe("RespostasDoFormulario (leitura)", () => {
  it("mostra cada resposta pelo rótulo da pergunta, nunca pelo id", () => {
    render(<RespostasDoFormulario perguntas={PERGUNTAS} respostas={RESPOSTAS} />);
    expect(screen.getByText("Sim: Látex, Esparadrapo")).toBeInTheDocument();
    expect(screen.getByText("Coceira leve.")).toBeInTheDocument();
    expect(screen.getByText("Laser, Outro: Microagulhamento")).toBeInTheDocument();
    expect(screen.queryByText("latex")).toBeNull();
  });

  it("sinaliza 'Prefiro não responder' e esconde a condicional que não se aplica", () => {
    render(<RespostasDoFormulario perguntas={PERGUNTAS} respostas={RESPOSTAS} />);
    const lista = screen.getByLabelText("Formulário de Saúde");
    expect(within(lista).getByText("Prefiro não responder")).toBeInTheDocument();
    // a 5 depende de "sim" na 3, que foi recusada: não aparece
    expect(screen.queryByText("Pratica atividade física?")).toBeNull();
    // a 2 depende de "sim" na 1: aparece
    expect(screen.getByText("Qual a reação?")).toBeInTheDocument();
  });

  it("destaque da clínica só quando vier (Boarding Check), com rótulo para o leitor de tela", () => {
    const { rerender } = render(<RespostasDoFormulario perguntas={PERGUNTAS} respostas={RESPOSTAS} />);
    expect(screen.queryByText(/Destaque da clínica/)).toBeNull();
    rerender(<RespostasDoFormulario perguntas={PERGUNTAS} respostas={RESPOSTAS} destaques={{ [id(1)]: "Alergia informada" }} />);
    expect(screen.getByText("Alergia informada").textContent).toContain("Alergia informada");
    expect(screen.getByText(/Destaque da clínica/)).toHaveClass("sr-only");
  });

  it("sem violação do axe", async () => {
    const { container } = render(<RespostasDoFormulario perguntas={PERGUNTAS} respostas={RESPOSTAS} destaques={{ [id(1)]: "Alergia informada" }} />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
