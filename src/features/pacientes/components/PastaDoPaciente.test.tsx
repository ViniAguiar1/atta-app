import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FichaDoPaciente } from "@/server/pacientes/porta";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { PastaDoPaciente } from "./PastaDoPaciente";

// Paciente fictício (CPF gerado, contato de exemplo): nunca dado real.
const ficha = (mais: Partial<FichaDoPaciente> = {}): FichaDoPaciente => ({
  id: "aaaa0000-0000-4000-8000-000000000001",
  nome: "Carla Siqueira",
  nomeCivil: "Carlos Eduardo Siqueira",
  nomeSocial: "Carla Siqueira",
  nascimento: "1982-01-30",
  identificacao: { tipo: "cpf", mascarado: "···.···.066-11" },
  contato: { celular: "(19) 99311-8080", email: "carla.siq@exemplo.test" },
  selo: null,
  seloExpirouEm: null,
  origem: "recepcao",
  vinculadoEm: "2026-05-05T12:00:00Z",
  acessoARede: "proprio",
  ...mais,
});

const valor = (rotulo: string) => {
  const termo = screen.getAllByText(rotulo, { selector: "dt" })[0]!;
  return termo.nextElementSibling as HTMLElement;
};

describe("Pasta do Paciente, topo (captura 12)", () => {
  it("Dados cadastrais na ordem do simulador, com o contato inteiro e o CPF mascarado", () => {
    render(<PastaDoPaciente ficha={ficha()} />);
    const dados = screen.getByRole("region", { name: "Dados cadastrais" });
    expect(within(dados).getAllByRole("term").map((dt) => dt.textContent)).toEqual([
      "Nome social", "Nome civil", "Identificação", "Nascimento", "Celular", "E-mail", "Endereço",
      "Contato de emergência", "Identidade verificada", "Convênio", "Carteirinha",
    ]);
    expect(valor("Nome civil")).toHaveTextContent("Carlos Eduardo Siqueira");
    expect(valor("Nascimento")).toHaveTextContent("30/01/1982");
    expect(valor("Celular")).toHaveTextContent("(19) 99311-8080");
    expect(valor("E-mail")).toHaveTextContent("carla.siq@exemplo.test");
    expect(valor("Identificação")).toHaveTextContent("···.···.066-11");
    expect(valor("Identificação")).toHaveTextContent("CPF terminado em 066-11");
    // o que a API ainda não traz fica em "—", sem dado inventado
    for (const r of ["Endereço", "Contato de emergência", "Convênio", "Carteirinha"]) expect(valor(r)).toHaveTextContent("—");
    expect(valor("Identidade verificada")).toHaveTextContent("Sem selo");
    expect(document.body).not.toHaveTextContent(/saúde/i);
  });

  it("sem nome social a linha some; selo válido e selo expirado com a data", () => {
    const { unmount } = render(<PastaDoPaciente ficha={ficha({ nomeSocial: null, selo: { validoAte: "2027-06-30T15:00:00Z" } })} />);
    expect(screen.queryByText("Nome social", { selector: "dt" })).toBeNull();
    expect(valor("Identidade verificada")).toHaveTextContent("Com selo");
    expect(valor("Identidade verificada")).toHaveTextContent("30/06/2027");
    unmount();
    // 01/06 às 01:30 UTC ainda é 31/05 em São Paulo: a data sai no fuso da clínica, não no UTC
    render(<PastaDoPaciente ficha={ficha({ seloExpirouEm: "2026-06-01T01:30:00+00:00" })} />);
    expect(valor("Identidade verificada")).toHaveTextContent("Selo expirado em 31/05/2026 (vale 1 ano)");
  });

  it("Resumo do paciente: situação Completo ou Incompleto e os números ainda sem fonte em —", () => {
    const { unmount } = render(<PastaDoPaciente ficha={ficha()} />);
    const resumo = screen.getByRole("complementary", { name: "Resumo do paciente" });
    expect(within(resumo).getByText("Completo")).toBeInTheDocument();
    for (const r of ["Atendimentos hoje", "Termos assinados", "Pendências"]) {
      expect(within(resumo).getByText(r).nextElementSibling).toHaveTextContent("—");
    }
    expect(resumo).toHaveTextContent("Abrir a pasta é leitura de dado pessoal e fica na Auditoria.");
    unmount();
    render(<PastaDoPaciente ficha={ficha({ identificacao: { tipo: "incompleto" }, contato: null })} />);
    const incompleto = screen.getByRole("complementary", { name: "Resumo do paciente" });
    expect(within(incompleto).getByText("Incompleto")).toBeInTheDocument();
    expect(valor("Celular")).toHaveTextContent("Sem celular");
    expect(valor("E-mail")).toHaveTextContent("Sem e-mail");
  });

  it("passa no axe", async () => {
    const { container } = render(<PastaDoPaciente ficha={ficha()} />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
