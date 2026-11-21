import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import type { FichaDoPaciente } from "@/server/pacientes/porta";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { PastaDoPaciente } from "./PastaDoPaciente";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeAll(() => {
  // o jsdom não implementa o <dialog> modal
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

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
  arquivadoEm: null,
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
    expect(dados).not.toHaveTextContent(/saúde/i); // saúde só como contagem, no cartão de Vínculos
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

  it("Vínculos e consentimentos (captura 13): origem com a data, saúde só a contagem e o expansor do conflito", () => {
    const { unmount } = render(<PastaDoPaciente ficha={ficha()} />);
    const vinculos = screen.getByRole("region", { name: "Vínculos e consentimentos" });
    expect(valor("Origem do cadastro")).toHaveTextContent("Cadastrado nesta clínica em 05/05/2026");
    for (const r of ["Consentimento do Termo ATTA", "Responsável / representante"]) expect(valor(r)).toHaveTextContent("—");
    expect(valor("Respostas de saúde")).toHaveTextContent("— · só a contagem");
    expect(within(vinculos).getByText("Qual dado vale quando há conflito")).toBeInTheDocument();
    expect(vinculos).not.toHaveTextContent(/RN-PAC/);
    unmount();
    // 15/06 às 01:30 UTC é 14/06 às 22:30 em São Paulo: a data sai no fuso da clínica
    render(<PastaDoPaciente ficha={ficha({ origem: "atta_me", vinculadoEm: "2026-06-15T01:30:00+00:00", acessoARede: "pendente" })} />);
    expect(valor("Origem do cadastro")).toHaveTextContent("Vinculado a esta clínica em 14/06/2026");
    expect(valor("Origem do cadastro")).toHaveTextContent("até o paciente autorizar");
  });

  it("Arquivar: só com a action do gestor; confirma no <dialog> e diz o motivo da recusa", async () => {
    const { unmount } = render(<PastaDoPaciente ficha={ficha()} />);
    expect(screen.queryByRole("button", { name: "Arquivar paciente" })).toBeNull(); // Colaborador
    unmount();
    const arquivar = vi.fn().mockResolvedValueOnce(falha("CONFLITO", "x", undefined, "ATTA-IN-0003:appointments")).mockResolvedValueOnce(ok({ arquivado: true }));
    const tela = render(<PastaDoPaciente ficha={ficha()} arquivar={arquivar} />);
    const botao = screen.getByRole("button", { name: "Arquivar paciente" });
    await userEvent.click(botao);
    const dialogo = screen.getByRole("dialog", { name: "Arquivar paciente?" });
    await userEvent.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Cancele ou conclua os agendamentos antes de arquivar.");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(arquivar).toHaveBeenLastCalledWith({ id: ficha().id, arquivar: true });
    // o refresh traz a ficha arquivada: o botão some e o foco vai ao aviso, não ao body
    tela.rerender(<PastaDoPaciente ficha={ficha({ arquivadoEm: "2026-11-21T01:30:00+00:00" })} arquivar={arquivar} />);
    expect(screen.getByRole("status")).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Paciente arquivado em 20/11/2026");
  });

  it("arquivado: aviso com a data; o gestor desarquiva ali, o Colaborador só lê", async () => {
    const arquivar = vi.fn().mockResolvedValue(ok({ arquivado: false }));
    const { unmount } = render(<PastaDoPaciente ficha={ficha({ arquivadoEm: "2026-11-20T15:00:00Z" })} arquivar={arquivar} />);
    expect(screen.getByRole("status")).toHaveTextContent("Paciente arquivado em 20/11/2026");
    expect(screen.queryByRole("button", { name: "Arquivar paciente" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Desarquivar" }));
    expect(arquivar).toHaveBeenCalledWith({ id: ficha().id, arquivar: false });
    expect(screen.getByRole("status")).not.toHaveFocus(); // abrir a Pasta de um arquivado não move o foco
    unmount();
    render(<PastaDoPaciente ficha={ficha({ arquivadoEm: "2026-11-20T15:00:00Z" })} />);
    expect(screen.queryByRole("button", { name: "Desarquivar" })).toBeNull();
  });

  it("passa no axe", async () => {
    const { container } = render(<PastaDoPaciente ficha={ficha()} />);
    expect(await violacoesDoAxe(container)).toEqual([]);
  });
});
