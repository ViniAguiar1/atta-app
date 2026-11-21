import { cleanup, configure, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MODELOS_SIMULADOS, SERVICOS_SIMULADOS } from "@/server/documentos/simulado";
import { MenuDoModelo } from "./MenuDoModelo";

const acoes = vi.hoisted(() => ({ publicarModelo: vi.fn(), inativarModelo: vi.fn(), vincularProcedimentos: vi.fn(), listarServicos: vi.fn() }));
const roteador = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => roteador }));
configure({ asyncUtilTimeout: 4000 });

// O jsdom não tem showModal: o <dialog> só abre.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

const [ativo, rascunho, inativo] = MODELOS_SIMULADOS as [typeof MODELOS_SIMULADOS[0], typeof MODELOS_SIMULADOS[0], typeof MODELOS_SIMULADOS[0]];

describe("menu ⋮ do modelo", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("só as ações do servidor com destino, sem editar; publicar sem condição continua no Tab e lê o motivo", async () => {
    render(<MenuDoModelo modelo={rascunho} />);
    const menu = screen.getByRole("button", { name: "Ações de Política de cancelamento" });
    expect(menu).not.toHaveAttribute("aria-haspopup");
    expect(menu).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(menu.getAttribute("aria-controls")!)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Vincular procedimentos" })).toHaveFocus();
    await userEvent.tab();
    const publicar = screen.getByRole("button", { name: /Publicar/ });
    expect(publicar).toHaveFocus(); // aria-disabled, não disabled: o motivo é lido
    expect(publicar).toHaveAttribute("aria-disabled", "true");
    expect(publicar).toHaveAccessibleDescription("Vincule ao menos um procedimento para publicar.");
    await userEvent.click(publicar);
    expect(acoes.publicarModelo).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(menu).toHaveFocus();
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  it("modelo inativo não tem ação: não mostra o ⋮", () => {
    render(<MenuDoModelo modelo={inativo} />);
    expect(screen.queryByRole("button", { name: /Ações de/ })).toBeNull();
  });

  it("publicar chama a action e recarrega; erro de campo vira a mensagem dele", async () => {
    acoes.publicarModelo.mockResolvedValue({ ok: true, data: { versao: 3 } });
    render(<MenuDoModelo modelo={ativo} />);
    await userEvent.click(screen.getByRole("button", { name: /Ações de TCLE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Versão 3 publicada.");
    expect(acoes.publicarModelo).toHaveBeenCalledWith(ativo.id);
    expect(roteador.refresh).toHaveBeenCalled();

    acoes.publicarModelo.mockResolvedValue({ ok: false, error: { code: "VALIDACAO", message: "x", fields: [{ campo: "required", code: "VALIDACAO" }] } });
    await userEvent.click(screen.getByRole("button", { name: /Ações de TCLE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(await screen.findByText("Defina se a recusa impede o atendimento antes de publicar.")).toBeInTheDocument();
  });

  it("inativar pede confirmação e só então chama a action", async () => {
    acoes.inativarModelo.mockResolvedValue({ ok: true, data: undefined });
    render(<MenuDoModelo modelo={ativo} />);
    await userEvent.click(screen.getByRole("button", { name: /Ações de TCLE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Inativar" }));
    const dialogo = screen.getByRole("dialog", { name: /Inativar "TCLE — Toxina botulínica"\?/ });
    expect(within(dialogo).getByText(/não volta a ficar ativo/)).toBeInTheDocument();
    expect(acoes.inativarModelo).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Inativar modelo" }));
    expect(acoes.inativarModelo).toHaveBeenCalledWith(ativo.id);
    expect(roteador.refresh).toHaveBeenCalled();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Ações de TCLE/ })).toHaveFocus()); // o foco volta ao ⋮
  });

  it("vincular lista os Serviços (inativo marcado), parte dos já vinculados e salva o conjunto inteiro", async () => {
    acoes.listarServicos.mockResolvedValue({ ok: true, data: SERVICOS_SIMULADOS });
    acoes.vincularProcedimentos.mockResolvedValue({ ok: true, data: undefined });
    render(<MenuDoModelo modelo={ativo} />);
    await userEvent.click(screen.getByRole("button", { name: /Ações de TCLE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular procedimentos" }));
    const dialogo = screen.getByRole("dialog", { name: /Procedimentos de/ });
    expect(await within(dialogo).findByRole("checkbox", { name: "Toxina botulínica" })).toBeChecked();
    expect(within(dialogo).getByRole("checkbox", { name: /Peeling químico\s*inativo/ })).not.toBeChecked();
    await userEvent.click(within(dialogo).getByRole("checkbox", { name: "Preenchimento labial" }));
    await userEvent.click(within(dialogo).getByRole("button", { name: "Salvar procedimentos" }));
    expect(acoes.vincularProcedimentos).toHaveBeenCalledWith({ modeloId: ativo.id, servicoIds: ["cccc0000-0000-4000-8000-000000000001"] });
  });

  it("cancelar um diálogo devolve o foco ao ⋮", async () => {
    acoes.listarServicos.mockResolvedValue({ ok: true, data: SERVICOS_SIMULADOS });
    render(<MenuDoModelo modelo={ativo} />);
    await userEvent.click(screen.getByRole("button", { name: /Ações de TCLE/ }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular procedimentos" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /Ações de TCLE/ })).toHaveFocus());
  });
});
