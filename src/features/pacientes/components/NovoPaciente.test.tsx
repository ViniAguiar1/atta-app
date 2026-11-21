import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { falha, ok } from "@/lib/errors";
import type { CartaoDaRede } from "@/server/pacientes/porta";
import { formatarCpf, NovoPaciente } from "./NovoPaciente";

// o jsdom não implementa o modo modal do <dialog>: o substituto abre e registra a chamada; o foco preso e o fundo
// inerte do navegador são provados no e2e (Tab no último botão)
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// dados fictícios: CPF gerado, nome inventado
const cartao: CartaoDaRede = {
  id: "5a5a0000-0000-4000-8000-000000000099", nome: "Marina Costa", nomeCivil: "Marina Costa", nomeSocial: null,
  nascimento: "1991-04-12", identificacao: { tipo: "cpf", mascarado: "···.···.330-23" }, incompleto: false,
  contato: { celular: "(11) ·····-5566", email: "ma···@exemplo.test" }, selo: null, respostasDeSaude: 2,
};

function montar(consulta: Awaited<ReturnType<Parameters<typeof NovoPaciente>[0]["acoes"]["consultar"]>>) {
  const acoes = {
    consultar: vi.fn(async () => consulta),
    vincular: vi.fn(async () => ok({ id: cartao.id, situacao: "vinculado" as const })),
    cadastrar: vi.fn(async () => ok({ id: "5a5a0000-0000-4000-8000-000000000123", reaproveitado: false })),
    cartao: vi.fn(async () => ok({ ...cartao, nome: "Juliana Prates", nomeCivil: "Juliana Prates", respostasDeSaude: null })),
  };
  render(<NovoPaciente clinica="Clínica Alfa Estética" acoes={acoes} />);
  return acoes;
}

const abrir = async () => {
  await userEvent.click(screen.getByRole("button", { name: "+ Novo paciente" }));
  return screen.getByRole("dialog", { name: "Novo paciente" });
};
const buscarCpf = async (dialogo: HTMLElement, cpf = "11222333023") => {
  await userEvent.type(within(dialogo).getByLabelText("CPF"), cpf);
  await userEvent.click(within(dialogo).getByRole("button", { name: "Buscar na rede" }));
};

describe("Novo paciente (simulador, capturas 15 a 18)", () => {
  it("formata o CPF enquanto digita", () => {
    expect(formatarCpf("11222333023")).toBe("112.223.330-23");
    expect(formatarCpf("1122")).toBe("112.2");
  });

  it("abre o <dialog> em modo modal com o foco no CPF, sem a linha de exemplos, passa no axe e fecha com Esc devolvendo o foco", async () => {
    montar(ok({ situacao: "nao_encontrado" }));
    const dialogo = await abrir();
    expect(dialogo.tagName).toBe("DIALOG");
    expect(showModal).toHaveBeenCalled();
    expect(within(dialogo).getByLabelText("CPF")).toHaveFocus();
    expect(dialogo).toHaveTextContent("Cada CPF existe uma única vez na rede ATTA.");
    expect(dialogo).not.toHaveTextContent(/Exemplos|RN-PAC|PDD/);
    expect(within(dialogo).getByText("Aguardando busca")).toBeInTheDocument();
    expect(await violacoesDoAxe(dialogo)).toEqual([]);
    // o Esc do navegador vira o evento cancel do <dialog>
    fireEvent(dialogo, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "+ Novo paciente" })).toHaveFocus();
  });

  it("na rede: mostra o cadastro existente (contato mascarado, saúde só a contagem) e Cadastrar paciente vincula", async () => {
    const acoes = montar(ok({ situacao: "na_rede", cartao }));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    expect(acoes.consultar).toHaveBeenCalledWith({ cpf: "112.223.330-23" });
    expect(await within(dialogo).findAllByText("Marina Costa")).toHaveLength(2); // no cartão e no resumo
    expect(dialogo).toHaveTextContent("Nome civil Marina Costa · nascimento 12/04/1991");
    expect(dialogo).toHaveTextContent("(11) ·····-5566 · ma···@exemplo.test");
    expect(dialogo).toHaveTextContent("Respostas de saúde: 2 na rede · só a contagem");
    expect(within(dialogo).getByText("Já existe na rede")).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    await waitFor(() => expect(acoes.vincular).toHaveBeenCalledWith({ cpf: "112.223.330-23" }));
    expect(refresh).toHaveBeenCalled();
    expect(acoes.cadastrar).not.toHaveBeenCalled();
  });

  it("já paciente daqui: mostra o cartão dele acima do aviso (captura 16), não cria outro e não oferece o Cadastrar", async () => {
    const acoes = montar(ok({ situacao: "ja_paciente", id: cartao.id }));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    expect(await within(dialogo).findByText("Não é possível criar outro cadastro.")).toBeInTheDocument();
    expect(acoes.cartao).toHaveBeenCalledWith({ id: cartao.id });
    expect(await within(dialogo).findAllByText("Juliana Prates")).toHaveLength(2); // no cartão e no resumo
    expect(dialogo).toHaveTextContent("(11) ·····-5566");
    expect(dialogo).not.toHaveTextContent("Respostas de saúde"); // a ficha não traz a contagem
    expect(within(dialogo).queryByRole("button", { name: "Cadastrar paciente" })).toBeNull();
  });

  it("primeira vez na rede: abre os campos, valida na tela e cadastra pelo corpo da action", async () => {
    const acoes = montar(ok({ situacao: "nao_encontrado" }));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    expect(await within(dialogo).findByText("Consulta interna: este CPF ainda não existe na base ATTA.")).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    expect(within(dialogo).getByLabelText("Nome civil")).toHaveAttribute("aria-invalid", "true");
    expect(acoes.cadastrar).not.toHaveBeenCalled();
    await userEvent.type(within(dialogo).getByLabelText("Nome civil"), "Lucas Pereira");
    await userEvent.type(within(dialogo).getByLabelText("Data de nascimento"), "12/04/1991");
    await userEvent.type(within(dialogo).getByLabelText("Celular"), "(11) 98765-5566");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    await waitFor(() =>
      expect(acoes.cadastrar).toHaveBeenCalledWith({
        documento: { tipo: "cpf", numero: "112.223.330-23" }, nomeCivil: "Lucas Pereira", nomeSocial: "",
        nascimento: "12/04/1991", celular: "(11) 98765-5566", email: "",
      }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("estrangeiro: troca o CPF pelo RNE, abre os campos e cadastra como RNE", async () => {
    const acoes = montar(ok({ situacao: "nao_encontrado" }));
    const dialogo = await abrir();
    await userEvent.click(within(dialogo).getByLabelText("Estrangeiro (informar RNE no lugar do CPF)"));
    expect(within(dialogo).getByText("O cadastro fica marcado como incompleto até haver CPF.")).toBeInTheDocument();
    await userEvent.type(within(dialogo).getByLabelText("RNE (Registro Nacional de Estrangeiro)"), "v123456a");
    await userEvent.type(within(dialogo).getByLabelText("Nome civil"), "Lucas Pereira");
    await userEvent.type(within(dialogo).getByLabelText("Data de nascimento"), "12/04/1991");
    await userEvent.type(within(dialogo).getByLabelText("Celular"), "11987655566");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    await waitFor(() => expect(acoes.cadastrar).toHaveBeenCalledWith(expect.objectContaining({ documento: { tipo: "estrangeiro", especie: "rne", numero: "V123456A" } })));
    expect(acoes.consultar).not.toHaveBeenCalled();
  });

  it("erro do servidor aparece no rodapé, com a mensagem da tela (não a do servidor)", async () => {
    montar(falha("LIMITE", "texto do servidor"));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent("Muitas buscas seguidas. Aguarde um pouco e tente de novo.");
    expect(dialogo).not.toHaveTextContent("texto do servidor");
  });

  it("cadastro que reaproveita a pessoa (CPF entrou na rede no meio) avisa e mostra o estado atual, sem fechar", async () => {
    const acoes = montar(ok({ situacao: "nao_encontrado" }));
    acoes.cadastrar.mockResolvedValueOnce(ok({ id: cartao.id, reaproveitado: true }));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    await within(dialogo).findByText("Consulta interna: este CPF ainda não existe na base ATTA.");
    acoes.consultar.mockResolvedValueOnce(ok({ situacao: "ja_paciente", id: cartao.id }));
    await userEvent.type(within(dialogo).getByLabelText("Nome civil"), "Lucas Pereira");
    await userEvent.type(within(dialogo).getByLabelText("Data de nascimento"), "12/04/1991");
    await userEvent.type(within(dialogo).getByLabelText("Celular"), "11987655566");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    expect(await within(dialogo).findByText(/Este CPF entrou na rede enquanto o cadastro era feito/)).toBeInTheDocument();
    expect(await within(dialogo).findByText("Não é possível criar outro cadastro.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("validação leva o foco ao primeiro campo com problema", async () => {
    montar(ok({ situacao: "nao_encontrado" }));
    const dialogo = await abrir();
    await buscarCpf(dialogo);
    await within(dialogo).findByText("Consulta interna: este CPF ainda não existe na base ATTA.");
    await userEvent.click(within(dialogo).getByRole("button", { name: "Cadastrar paciente" }));
    await waitFor(() => expect(within(dialogo).getByLabelText("Nome civil")).toHaveFocus());
  });
});
