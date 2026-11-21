import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { ok, falha } from "@/lib/errors";
import type { PerfilDaClinica } from "@/server/perfil/porta";

const salvar = vi.fn();
vi.mock("../actions", () => ({ salvarCampoDoPerfil: (e: unknown) => salvar(e) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const { TelaPerfil } = await import("./TelaPerfil");

// o jsdom não tem o <dialog> modal: o mínimo para abrir e fechar (o foco preso e o fundo inerte são do navegador)
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute("open");
};

const PERFIL: PerfilDaClinica = {
  desde: "2026-03-01T12:00:00Z",
  fuso: "America/Sao_Paulo",
  campos: {
    trade_name: "Clínica Fictícia",
    legal_name: null,
    cnpj: "11222333000181",
    tax_registration: null,
    main_specialty: "Biomedicina Estética",
    address_cep: "01310930",
    address_street: null,
    address_number: null,
    address_complement: null,
    address_city: null,
    address_uf: null,
    phone: null,
    clinic_whatsapp: "11999990000",
    commercial_email: null,
  },
  gestor: null,
  responsavelTecnico: null,
  salvoEm: "2026-11-21T13:40:00Z",
  faltando: ["legal_name", "address", "technical_lead"],
};

beforeEach(() => {
  salvar.mockReset();
  refresh.mockReset();
});

describe("Perfil da Clínica (MIG-42, captura 42)", () => {
  it("faixa do salvamento automático, último salvamento no fuso, aviso do que falta e os campos com máscara", async () => {
    const { container } = render(<TelaPerfil resultado={ok(PERFIL)} />);
    expect(screen.getByRole("note")).toHaveTextContent("Sem botão de salvar.");
    expect(screen.getByText("Último salvamento às 10:40.")).toBeInTheDocument();
    expect(screen.getByText("Clínica desde 01/03/2026")).toBeInTheDocument();
    const aviso = screen.getByRole("status");
    for (const item of ["Razão social", "Endereço", "Responsável Técnico"]) expect(within(aviso).getByText(item)).toBeInTheDocument();
    expect(screen.getByLabelText("CNPJ")).toHaveValue("11.222.333/0001-81");
    expect(screen.getByLabelText("CEP")).toHaveValue("01310-930");
    expect(screen.getByLabelText("WhatsApp da clínica")).toHaveValue("(11) 99999-0000");
    expect(screen.getByLabelText("Razão social")).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Inscrição estadual/municipal (opcional)")).not.toHaveAttribute("aria-required");
    expect(await violacoesDoAxe(container)).toEqual([]);
  });

  it("salva o campo ao sair dele e mostra o salvo, aqui e no topo", async () => {
    salvar.mockResolvedValue(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    await userEvent.type(screen.getByLabelText("Inscrição estadual/municipal (opcional)"), "123456");
    await userEvent.tab();
    expect(salvar).toHaveBeenCalledWith({ campo: "tax_registration", valor: "123456" });
    expect(await screen.findByText("Salvo às 11:05.")).toBeInTheDocument();
    expect(screen.getByText("Último salvamento às 11:05.")).toBeInTheDocument();
    // relê no servidor, para o aviso do que falta (missing_required) acompanhar (nota do Frontend 2)
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Enter seguido de blur antes da resposta manda o valor uma vez só", async () => {
    let responder: (v: unknown) => void = () => {};
    salvar.mockReturnValue(new Promise((r) => (responder = r)));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    await userEvent.type(screen.getByLabelText("Inscrição estadual/municipal (opcional)"), "123456{Enter}");
    await userEvent.tab();
    expect(salvar).toHaveBeenCalledTimes(1);
    responder(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
  });

  it("1º preenchimento da Razão social pede confirmação mostrando o valor (R43); confirmar salva e trava o campo", async () => {
    salvar.mockResolvedValue(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    await userEvent.type(screen.getByLabelText("Razão social"), "Clínica Fictícia Ltda.{Enter}");
    expect(salvar).not.toHaveBeenCalled();
    const dialogo = screen.getByRole("dialog", { name: "Confirmar Razão social?" });
    expect(dialogo).toHaveTextContent("Clínica Fictícia Ltda.");
    // o leitor de tela ouve o valor e o aviso de que trava (nota do Frontend 2)
    expect(dialogo).toHaveAccessibleDescription(/Clínica Fictícia Ltda\..*só muda pelo suporte ATTA/);
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e salvar" }));
    expect(salvar).toHaveBeenCalledWith({ campo: "legal_name", valor: "Clínica Fictícia Ltda." });
    expect(await screen.findByText("Salvo às 11:05.")).toBeInTheDocument();
    expect(screen.getByLabelText("Razão social")).toHaveAttribute("readonly");
  });

  it("voltar na confirmação não salva e devolve o foco ao campo", async () => {
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    const razao = screen.getByLabelText("Razão social");
    await userEvent.type(razao, "Outra Razão Ltda.{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Voltar e corrigir" }));
    expect(salvar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(razao).toHaveFocus();
  });

  it("CNPJ e Razão social já informados ficam só para leitura, com o caminho da troca (PDD §10.4.3)", () => {
    render(<TelaPerfil resultado={ok({ ...PERFIL, campos: { ...PERFIL.campos, legal_name: "Clínica Fictícia Ltda." } })} />);
    for (const rotulo of ["CNPJ", "Razão social"]) expect(screen.getByLabelText(rotulo)).toHaveAttribute("readonly");
    expect(screen.getAllByText("Para trocar, peça ao suporte ATTA: a alteração passa por conferência.")).toHaveLength(2);
  });

  it("CNPJ com dígito errado não vai ao servidor; recusa do banco aparece no campo", async () => {
    render(<TelaPerfil resultado={ok({ ...PERFIL, campos: { ...PERFIL.campos, cnpj: null } })} />);
    const cnpj = screen.getByLabelText("CNPJ");
    await userEvent.type(cnpj, "11222333000182");
    await userEvent.tab();
    expect(salvar).not.toHaveBeenCalled();
    expect(screen.getByText("Confira o CNPJ: os dígitos não conferem.")).toBeInTheDocument();

    salvar.mockResolvedValue(falha("VALIDACAO", "recusado"));
    await userEvent.type(screen.getByLabelText("E-mail comercial"), "contato@exemplo.test{Enter}");
    expect(await screen.findByText("Confira este campo: o valor não foi aceito.")).toBeInTheDocument();
  });

  // "12ABC34501DE35": o exemplo publicado pela Receita (IN RFB 2.229/2024), não é de ninguém
  it("CNPJ alfanumérico: digitado em minúsculas aparece com a máscara em maiúsculas e vai sem pontuação (ADR 0001)", async () => {
    salvar.mockResolvedValue(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok({ ...PERFIL, campos: { ...PERFIL.campos, cnpj: null } })} />);
    const cnpj = screen.getByLabelText("CNPJ");
    expect(cnpj).not.toHaveAttribute("inputmode", "numeric");
    expect(cnpj).toHaveAttribute("autocapitalize", "characters");
    await userEvent.type(cnpj, "12abc34501de35");
    expect(cnpj).toHaveValue("12.ABC.345/01DE-35");
    await userEvent.keyboard("{Enter}");
    const dialogo = screen.getByRole("dialog", { name: "Confirmar CNPJ?" });
    expect(dialogo).toHaveTextContent("12.ABC.345/01DE-35");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar e salvar" }));
    expect(salvar).toHaveBeenCalledWith({ campo: "cnpj", valor: "12ABC34501DE35" });
    expect(await screen.findByText("Salvo às 11:05.")).toBeInTheDocument();
    expect(screen.getByLabelText("CNPJ")).toHaveAttribute("readonly");
  });

  it("falha de rede ao salvar avisa e não prende o campo: o mesmo valor pode ir de novo (nota do Frontend 2)", async () => {
    salvar.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    const ie = screen.getByLabelText("Inscrição estadual/municipal (opcional)");
    await userEvent.type(ie, "123456{Enter}");
    expect(await screen.findByText("Não conseguimos salvar agora. Tente de novo em instantes.")).toBeInTheDocument();
    await userEvent.type(ie, "{Enter}");
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Salvo às 11:05.")).toBeInTheDocument();
  });

  it("código do que falta que a tela não conhece aparece com texto genérico, nunca o código (nota do Tech Lead Frontend)", () => {
    render(<TelaPerfil resultado={ok({ ...PERFIL, faltando: ["legal_name", "campo_novo"] })} />);
    expect(screen.getByText("Outro dado obrigatório do Perfil")).toBeInTheDocument();
    expect(screen.queryByText("campo_novo")).toBeNull();
  });

  it("e-mail sem estrutura válida não vai ao servidor e marca o campo (§16.6; achado do QA no #281)", async () => {
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    const email = screen.getByLabelText("E-mail comercial");
    await userEvent.type(email, "nao-e-email{Enter}");
    expect(salvar).not.toHaveBeenCalled();
    expect(screen.getByText("Confira o e-mail: falta o @ ou o domínio.")).toBeInTheDocument();
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("a UF salva logo ao escolher", async () => {
    salvar.mockResolvedValue(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
    expect(salvar).toHaveBeenCalledWith({ campo: "address_uf", valor: "SP" });
  });

  it("sem leitura real (produção até o backend): o estado vazio do design, sem formulário", () => {
    render(<TelaPerfil resultado={ok(null)} />);
    expect(screen.getByText("O perfil da clínica aparece aqui")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
