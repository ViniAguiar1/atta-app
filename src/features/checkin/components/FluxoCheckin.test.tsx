import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxoCheckin } from "./FluxoCheckin";

const acoes = vi.hoisted(() => ({ iniciarCheckin: vi.fn(), confirmarCodigo: vi.fn(), reenviarCodigo: vi.fn() }));
vi.mock("../actions", () => acoes);

// A suíte inteira roda em paralelo: 1 s (padrão do findBy) às vezes não basta para a transição terminar.
configure({ asyncUtilTimeout: 4000 });

const DESAFIO = "00000000-1111-4111-8111-111111111111";

describe("FluxoCheckin", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    vi.useRealTimers(); // o relógio falso de um teste que falhou não vaza para o próximo
  });

  it("não chama o servidor com CPF inválido", async () => {
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224724");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Confira o CPF");
    expect(acoes.iniciarCheckin).not.toHaveBeenCalled();
  });

  it("vai do CPF ao código e ao desfecho, mostrando só o final do celular", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.confirmarCodigo.mockResolvedValue({ ok: true, data: { situacao: "concluido" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(acoes.iniciarCheckin).toHaveBeenCalledWith({ portal: "aurora", cpf: "529.982.247-25" });
    expect(await screen.findByText(/celular terminado em 4321/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Código"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("heading", { name: "Check-in concluído para este CPF" })).toHaveFocus();
  });

  it("código errado mostra o texto do PDD e limpa o campo", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.confirmarCodigo.mockResolvedValue({ ok: false, error: { code: "CONFLITO", message: "x" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await userEvent.type(await screen.findByLabelText("Código"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos confirmar o código.");
    expect(screen.getByLabelText("Código")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Reenviar código em/ })).toBeDisabled();
  });

  it("CPF sem atendimento hoje orienta a procurar a recepção", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: false, error: { code: "NAO_ENCONTRADO", message: "x" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não encontramos atendimento para hoje nesta clínica. Procure a recepção.");
  });

  it("no 5º erro o código cai: pede um novo e trava o Confirmar", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.confirmarCodigo.mockResolvedValue({ ok: false, error: { code: "LIMITE", message: "x" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await userEvent.type(await screen.findByLabelText("Código"), "999999");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este código não vale mais. Peça um novo.");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
  });

  it("ausente mostra o texto do simulador e volta ao início", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.confirmarCodigo.mockResolvedValue({ ok: true, data: { situacao: "ausente" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "47382169022");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await userEvent.type(await screen.findByLabelText("Código"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("heading", { name: "Este atendimento foi marcado como ausente." })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Voltar para o início" }));
    expect(screen.getByLabelText("CPF")).toHaveValue("");
  });

  it("código errado devolve o foco ao campo", async () => {
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.confirmarCodigo.mockResolvedValue({ ok: false, error: { code: "CONFLITO", message: "x" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await userEvent.type(await screen.findByLabelText("Código"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Código")).toHaveFocus();
  });

  it("reenvio com LIMITE do servidor orienta a procurar a recepção", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acoes.iniciarCheckin.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    acoes.reenviarCodigo.mockResolvedValue({ ok: false, error: { code: "LIMITE", message: "x" } });
    render(<FluxoCheckin portal="aurora" clinica="Clínica Aurora Estética" />);
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.click(screen.getByRole("button", { name: "Enviar código" }));
    await screen.findByLabelText("Código");
    vi.advanceTimersByTime(31_000);
    await userEvent.click(await screen.findByRole("button", { name: "Reenviar código" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não recebeu o código? Procure a recepção.");
  });
});
