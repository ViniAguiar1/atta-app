import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmeSeusDados } from "./ConfirmeSeusDados";
import type { DadosDoPaciente } from "./schema";

const acoes = vi.hoisted(() => ({ salvarDados: vi.fn(), buscarCep: vi.fn(), carregarDados: vi.fn() }));
vi.mock("./actions", () => acoes);
configure({ asyncUtilTimeout: 4000 });

// Pessoa inventada.
const DADOS: DadosDoPaciente = {
  nome: "Helena Prado Antunes",
  nomeSocial: "",
  cpfMascarado: "···.982.247-··",
  celular: "11987654321",
  email: "",
  cep: "01310100",
  logradouro: "Avenida Paulista",
  numero: "",
  complemento: "",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
  convenio: null,
};

describe("Confirme Seus Dados (§11.5)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("abre em leitura, com o que falta já aberto", () => {
    render(<ConfirmeSeusDados dados={DADOS} aoConcluir={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Confirme Seus Dados" })).toBeInTheDocument();
    expect(screen.getByText("Helena Prado Antunes")).toBeInTheDocument();
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome completo")).toBeNull(); // existe: só leitura
    expect(screen.getByLabelText("Número")).toBeInTheDocument(); // falta: aberto
    expect(screen.getByRole("button", { name: "Editar informações" })).toBeInTheDocument();
  });

  it("não avança com campo obrigatório vazio e mostra o erro no campo", async () => {
    render(<ConfirmeSeusDados dados={DADOS} aoConcluir={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Está tudo certo" }));
    expect(screen.getByLabelText("Número")).toHaveAttribute("aria-invalid", "true");
    expect(acoes.salvarDados).not.toHaveBeenCalled();
  });

  it("com tudo preenchido, salva e conclui", async () => {
    acoes.salvarDados.mockResolvedValue({ ok: true, data: { salvoEm: "x" } });
    const aoConcluir = vi.fn();
    render(<ConfirmeSeusDados dados={DADOS} aoConcluir={aoConcluir} />);
    await userEvent.type(screen.getByLabelText("Número"), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Está tudo certo" }));
    await vi.waitFor(() => expect(aoConcluir).toHaveBeenCalled());
    expect(acoes.salvarDados).toHaveBeenCalledWith(expect.objectContaining({ numero: "1000", nomeSocial: "" }));
  });

  it("editar abre os campos; nome social vem desmarcado e abre o campo ao marcar", async () => {
    render(<ConfirmeSeusDados dados={DADOS} aoConcluir={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar informações" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Helena Prado Antunes");
    const social = screen.getByRole("checkbox", { name: "Informar nome social" });
    expect(social).not.toBeChecked();
    await userEvent.click(social);
    expect(screen.getByLabelText("Nome social")).toBeInTheDocument();
  });

  it("CEP de 8 números preenche o endereço", async () => {
    acoes.buscarCep.mockResolvedValue({ ok: true, data: { logradouro: "Rua da Assembleia", bairro: "Centro", cidade: "Rio de Janeiro", uf: "RJ" } });
    render(<ConfirmeSeusDados dados={DADOS} aoConcluir={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar informações" }));
    await userEvent.clear(screen.getByLabelText("CEP"));
    await userEvent.type(screen.getByLabelText("CEP"), "20040020");
    expect(await screen.findByDisplayValue("Rua da Assembleia")).toBeInTheDocument();
    expect(acoes.buscarCep).toHaveBeenCalledWith("20040020");
  });

  it("CPF novo na rede mostra o aviso do PDD", () => {
    render(<ConfirmeSeusDados dados={DADOS} novo aoConcluir={vi.fn()} />);
    expect(screen.getByText("Não encontramos seu cadastro — vamos criar um novo, é rápido.")).toBeInTheDocument();
  });
});
