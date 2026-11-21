import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { ok, falha } from "@/lib/errors";
import type { PerfilDaClinica } from "@/server/perfil/porta";

const salvar = vi.fn();
vi.mock("../actions", () => ({ salvarCampoDoPerfil: (e: unknown) => salvar(e) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { TelaPerfil } = await import("./TelaPerfil");

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

beforeEach(() => salvar.mockReset());

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

  it("salva o campo ao sair dele, com os dígitos do CNPJ, e mostra o salvo", async () => {
    salvar.mockResolvedValue(ok({ salvoEm: "2026-11-21T14:05:00Z" }));
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    const razao = screen.getByLabelText("Razão social");
    await userEvent.type(razao, "Clínica Fictícia Ltda.");
    await userEvent.tab();
    expect(salvar).toHaveBeenCalledWith({ campo: "legal_name", valor: "Clínica Fictícia Ltda." });
    expect(await screen.findByText("Salvo às 11:05.")).toBeInTheDocument();
    expect(screen.getByText("Último salvamento às 11:05.")).toBeInTheDocument();
  });

  it("CNPJ com dígito errado não vai ao servidor; recusa do banco aparece no campo", async () => {
    render(<TelaPerfil resultado={ok(PERFIL)} />);
    const cnpj = screen.getByLabelText("CNPJ");
    await userEvent.clear(cnpj);
    await userEvent.type(cnpj, "11222333000182");
    await userEvent.tab();
    expect(salvar).not.toHaveBeenCalled();
    expect(screen.getByText("Confira o CNPJ: os dígitos não conferem.")).toBeInTheDocument();

    salvar.mockResolvedValue(falha("VALIDACAO", "recusado"));
    await userEvent.type(screen.getByLabelText("E-mail comercial"), "contato@exemplo.test{Enter}");
    expect(await screen.findByText("Confira este campo: o valor não foi aceito.")).toBeInTheDocument();
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
