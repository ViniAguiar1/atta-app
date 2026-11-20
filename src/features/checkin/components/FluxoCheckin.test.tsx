import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxoCheckin } from "./FluxoCheckin";

const acoes = vi.hoisted(() => ({ iniciarCheckin: vi.fn(), confirmarCodigo: vi.fn(), reenviarCodigo: vi.fn() }));
vi.mock("../actions", () => acoes);

const DESAFIO = "00000000-1111-4111-8111-111111111111";

describe("FluxoCheckin", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

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
    expect(await screen.findByRole("alert")).toHaveTextContent("Não encontramos atendimento hoje para este CPF. Procure a recepção.");
  });
});
