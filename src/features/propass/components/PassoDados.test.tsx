import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FluxoPropass } from "./FluxoPropass";

const acoes = vi.hoisted(() => ({ conferirDados: vi.fn() }));
vi.mock("../actions", () => acoes);
configure({ asyncUtilTimeout: 4000 });

async function preencher() {
  await userEvent.type(screen.getByLabelText("Nome completo"), "Bruna Reis");
  await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
  await userEvent.type(screen.getByLabelText("WhatsApp de contato"), "11987654321");
  await userEvent.selectOptions(screen.getByLabelText("Conselho"), "crm");
  await userEvent.type(screen.getByLabelText("Número de registro"), "990001");
  await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
}

describe("PROpass, passos 1 e 2", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);
  const abrir = () => render(<FluxoPropass clinica="Clínica Aurora Estética" email="bruna.reis@exemplo.test" conviteEm="2026-11-20T19:20:00.000Z" fuso="America/Sao_Paulo" />);

  it("mostra o e-mail travado e não chama o servidor com campo inválido", async () => {
    abrir();
    expect(screen.getByLabelText("E-mail profissional")).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await vi.waitFor(() => expect(screen.getByLabelText("Nome completo")).toHaveFocus());
    expect(screen.getByLabelText("CPF")).toHaveAccessibleDescription(/Informe o CPF\./); // vazio: falta, não "não bate"
    expect(acoes.conferirDados).not.toHaveBeenCalled();
  });

  it("com o conselho regularizado, vai ao passo 2 com a situação do backend", async () => {
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "regularizado", consultadoEm: "2026-11-20T19:24:00.000Z" } });
    abrir();
    expect(screen.getByText("Convite de 20/11/2026 16:20")).toBeInTheDocument(); // fuso da clínica, não o do navegador
    await preencher();
    expect(screen.getByLabelText("CPF")).toHaveValue("529.982.247-25");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("heading", { name: "Camada 1 — Validação ATTA (Conselho)" })).toHaveFocus();
    expect(screen.getByText("Regularizado (Conselho Ativo)")).toBeInTheDocument();
    expect(screen.getByText("consultado às 16:24")).toBeInTheDocument();
    expect(screen.getByText("CRM-SP 990.001")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByLabelText("Nome completo")).toHaveValue("Bruna Reis");
  });

  it("conselho que não confere fica no passo 1, com o erro no número", async () => {
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "nao_confere" } });
    abrir();
    await preencher();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/Não encontramos registro ativo/)).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText("Número de registro")).toHaveFocus()); // foco no próximo quadro
  });

  it("falha do servidor é anunciada (role=alert)", async () => {
    acoes.conferirDados.mockResolvedValue({ ok: false, error: { code: "INDISPONIVEL", message: "x" } });
    abrir();
    await preencher();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não conseguimos continuar agora");
  });

  it("sem consulta real (R20), o passo 2 não afirma a regularidade", async () => {
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado" } });
    abrir();
    await preencher();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText(/é feita pela equipe ATTA/)).toBeInTheDocument();
    expect(screen.queryByText("Regularizado (Conselho Ativo)")).toBeNull();
  });
});
