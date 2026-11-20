import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TelaPin } from "./TelaPin";

const acoes = vi.hoisted(() => ({ confirmarPin: vi.fn() }));
const roteador = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => roteador }));

configure({ asyncUtilTimeout: 4000 });

describe("TelaPin", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("não chama o servidor com menos de 4 dígitos e aceita só números", async () => {
    render(<TelaPin temLink />);
    await userEvent.type(screen.getByLabelText("Senha"), "2a4");
    expect(screen.getByLabelText("Senha")).toHaveValue("24");
    await userEvent.click(screen.getByRole("button", { name: "Ver atendimento" }));
    expect(screen.getByLabelText("Senha")).toHaveAccessibleDescription("Digite os 4 números da senha.");
    expect(acoes.confirmarPin).not.toHaveBeenCalled();
  });

  it("PIN certo recarrega a página no servidor", async () => {
    acoes.confirmarPin.mockResolvedValue({ ok: true, data: { status: "ok" } });
    render(<TelaPin temLink />);
    await userEvent.type(screen.getByLabelText("Senha"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Ver atendimento" }));
    expect(acoes.confirmarPin).toHaveBeenCalledWith({ pin: "2468" });
    await vi.waitFor(() => expect(roteador.refresh).toHaveBeenCalled());
  });

  it("PIN errado limpa o campo, avisa e devolve o foco", async () => {
    acoes.confirmarPin.mockResolvedValue({ ok: true, data: { status: "pin_incorreto" } });
    render(<TelaPin temLink />);
    await userEvent.type(screen.getByLabelText("Senha"), "1111");
    await userEvent.click(screen.getByRole("button", { name: "Ver atendimento" }));
    expect(await screen.findByText(/Senha não confere/)).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toHaveAccessibleDescription(/Senha não confere/);
    expect(screen.getByLabelText("Senha")).toHaveValue("");
    expect(screen.getByLabelText("Senha")).toHaveFocus();
  });

  it("bloqueio mostra os minutos que o servidor devolveu", async () => {
    acoes.confirmarPin.mockResolvedValue({ ok: true, data: { status: "bloqueado", minutos: 15 } });
    render(<TelaPin temLink />);
    await userEvent.type(screen.getByLabelText("Senha"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Ver atendimento" }));
    expect(await screen.findByText(/Tente de novo em 15 minutos\./)).toBeInTheDocument();
  });

  it("link sem validade troca o formulário pelo aviso", async () => {
    acoes.confirmarPin.mockResolvedValue({ ok: true, data: { status: "indisponivel" } });
    render(<TelaPin temLink />);
    await userEvent.type(screen.getByLabelText("Senha"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Ver atendimento" }));
    expect(await screen.findByRole("heading", { name: "Este link não vale mais." })).toHaveFocus();
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });

  it("sem o cookie do link já abre no aviso, sem formulário", () => {
    render(<TelaPin temLink={false} />);
    expect(screen.getByRole("heading", { name: "Este link não vale mais." })).toBeInTheDocument();
    expect(screen.queryByLabelText("Senha")).toBeNull();
  });
});
