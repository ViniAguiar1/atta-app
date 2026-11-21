import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxoPropass } from "./FluxoPropass";

const acoes = vi.hoisted(() => ({ conferirDados: vi.fn(), carregarTermo: vi.fn(), enviarPropass: vi.fn() }));
vi.mock("../actions", () => acoes);
configure({ asyncUtilTimeout: 4000 });

// O jsdom não desenha: o canvas é simulado, e a "assinatura" é um PNG fictício.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,iVBORw0KGgo=");
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

const TERMO = { titulo: "Termo de Autorização de Uso de Imagem de Assinatura Digital", paragrafos: ["Eu, Bruna Reis, autorizo…"] };

async function ateOTermo() {
  acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "regularizado", consultadoEm: "2026-11-20T19:24:00.000Z", pedirSenha: true } });
  acoes.carregarTermo.mockResolvedValue({ ok: true, data: { situacao: "pronto", termo: TERMO } });
  render(<FluxoPropass clinica="Clínica Aurora Estética" email="bruna.reis@exemplo.test" conviteEm="2026-11-20T19:20:00.000Z" fuso="America/Sao_Paulo" />);
  await userEvent.type(screen.getByLabelText("Nome completo"), "Bruna Reis");
  await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
  await userEvent.type(screen.getByLabelText("WhatsApp de contato"), "11987654321");
  await userEvent.selectOptions(screen.getByLabelText("Conselho"), "crm");
  await userEvent.type(screen.getByLabelText("Número de registro"), "990001");
  await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
  await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
  await screen.findByRole("heading", { level: 1, name: TERMO.titulo });
}

const desenhar = () => {
  expect(screen.getByText("Desenhe sua assinatura com o mouse ou o dedo")).toBeInTheDocument(); // a instrução é lida
  const quadro = document.querySelector("canvas")!;
  fireEvent.pointerDown(quadro, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(quadro, { clientX: 40, clientY: 20, pointerId: 1 });
  fireEvent.pointerUp(quadro, { pointerId: 1 });
};

describe("PROpass: termo, senha e envio", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("sem assinatura não segue; com assinatura e senha, envia tudo de uma vez e conclui", async () => {
    acoes.enviarPropass.mockResolvedValue({ ok: true, data: { status: "ok" } });
    await ateOTermo();
    await userEvent.click(screen.getByRole("button", { name: "Assinar o termo" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Desenhe sua assinatura no quadro.");
    desenhar();
    await userEvent.click(screen.getByRole("button", { name: "Assinar o termo" }));
    expect(await screen.findByRole("heading", { name: "Crie sua senha de 4 números" })).toHaveFocus();

    await userEvent.type(screen.getByLabelText("Senha"), "1234");
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Concluir o PROpass" }));
    expect(screen.getByLabelText("Senha")).toHaveAccessibleDescription(/menos óbvia/);
    expect(acoes.enviarPropass).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText("Senha"));
    await userEvent.type(screen.getByLabelText("Senha"), "2468");
    await userEvent.clear(screen.getByLabelText("Confirme a senha"));
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Concluir o PROpass" }));
    expect(await screen.findByRole("heading", { name: "PROpass concluído" })).toBeInTheDocument();
    expect(acoes.enviarPropass).toHaveBeenCalledWith(expect.objectContaining({ assinatura: "data:image/png;base64,iVBORw0KGgo=", leuAteOFim: true, pin: "2468" }));
    const { leitura } = acoes.enviarPropass.mock.calls[0]![0];
    expect(Date.parse(leitura.abertoEm)).toBeLessThanOrEqual(Date.parse(leitura.rolagemCompletaEm)); // os momentos do "Leia até o fim"
    expect(screen.getByText(/só agenda seus atendimentos depois dessa conferência/)).toBeInTheDocument();
  });

  it("recusa de identidade fica na senha com o aviso; falha ao carregar o termo é erro genérico, sem quadro", async () => {
    acoes.enviarPropass.mockResolvedValue({ ok: true, data: { status: "recusado" } });
    await ateOTermo();
    desenhar();
    await userEvent.click(screen.getByRole("button", { name: "Assinar o termo" }));
    await userEvent.type(await screen.findByLabelText("Senha"), "2468");
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Concluir o PROpass" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos confirmar seus dados");
    cleanup();

    acoes.carregarTermo.mockResolvedValue({ ok: false, error: { code: "INDISPONIVEL", message: "x" } });
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado", pedirSenha: true } });
    render(<FluxoPropass clinica="Clínica Aurora Estética" email="bruna.reis@exemplo.test" conviteEm="2026-11-20T19:20:00.000Z" fuso="America/Sao_Paulo" />);
    await userEvent.type(screen.getByLabelText("Nome completo"), "Bruna Reis");
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.type(screen.getByLabelText("WhatsApp de contato"), "11987654321");
    await userEvent.selectOptions(screen.getByLabelText("Conselho"), "crm");
    await userEvent.type(screen.getByLabelText("Número de registro"), "777777");
    await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos continuar agora");
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("quem já tem a senha do Boarding Check conclui do próprio termo, sem o passo da senha", async () => {
    acoes.enviarPropass.mockResolvedValue({ ok: true, data: { status: "ok" } });
    await ateOTermo();
    // o passo 2 do servidor disse para usar a senha que já existe
    cleanup();
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado", pedirSenha: false } });
    acoes.carregarTermo.mockResolvedValue({ ok: true, data: { situacao: "pronto", termo: TERMO } });
    render(<FluxoPropass clinica="Clínica Aurora Estética" email="bruna.reis@exemplo.test" conviteEm="2026-11-20T19:20:00.000Z" fuso="America/Sao_Paulo" />);
    await userEvent.type(screen.getByLabelText("Nome completo"), "Bruna Reis");
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.type(screen.getByLabelText("WhatsApp de contato"), "11987654321");
    await userEvent.selectOptions(screen.getByLabelText("Conselho"), "crm");
    await userEvent.type(screen.getByLabelText("Número de registro"), "990001");
    await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { level: 1, name: TERMO.titulo });
    desenhar();
    await userEvent.click(screen.getByRole("button", { name: "Concluir o PROpass" }));
    expect(await screen.findByRole("heading", { name: "PROpass concluído" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Crie sua senha de 4 números" })).toBeNull();
    expect(acoes.enviarPropass.mock.calls.at(-1)![0].pin).toBeNull();
    expect(screen.getByText("Use a mesma senha de 4 números que você já usa no Boarding Check.")).toBeInTheDocument();
  });
});
