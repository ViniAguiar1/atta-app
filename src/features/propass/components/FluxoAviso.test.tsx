import { configure, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { violacoesDoAxe } from "@/components/ui/axe-de-teste";
import { FluxoPropass } from "./FluxoPropass";

// Aviso de Privacidade do Profissional com a trava LIGADA (PDD §10.4.3; P2b). O texto aqui é fictício, só de teste: o
// oficial vem da PO e entra em aviso-de-privacidade.ts. Com a trava ligada, o passo aparece entre o conselho e o Termo,
// a barra passa a ter 5 passos, a confirmação de leitura é obrigatória e a versão vai no envio.
const acoes = vi.hoisted(() => ({ conferirDados: vi.fn(), carregarTermo: vi.fn(), enviarPropass: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("../aviso-de-privacidade", () => ({
  AVISO_DE_PRIVACIDADE: { versao: "aviso-teste-v1", titulo: "Aviso de Privacidade (texto fictício de teste)", paragrafos: ["Parágrafo fictício 1.", "Parágrafo fictício 2."] },
}));
configure({ asyncUtilTimeout: 4000 });

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
  })) as never;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,iVBORw0KGgo=");
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

const TERMO = { titulo: "Termo de Autorização de Uso de Imagem de Assinatura Digital", paragrafos: ["Eu, Bruna Reis, autorizo…"] };

describe("PROpass com o Aviso de Privacidade ligado", () => {
  it("o aviso vem entre o conselho e o Termo, exige a confirmação e a versão vai no envio", async () => {
    acoes.conferirDados.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado", pedirSenha: true } });
    acoes.carregarTermo.mockResolvedValue({ ok: true, data: { situacao: "pronto", termo: TERMO } });
    acoes.enviarPropass.mockResolvedValue({ ok: true, data: { status: "ok", codigoAtta: "ATTA-7K3M-Q9PX-2HDV" } });
    const { container } = render(
      <FluxoPropass clinica="Clínica Aurora Estética" email="bruna.reis@exemplo.test" conviteEm="2026-11-20T19:20:00.000Z" fuso="America/Sao_Paulo" />,
    );
    expect(screen.getByText("Passo 1 de 5 · Confirmação de dados")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Nome completo"), "Bruna Reis");
    await userEvent.type(screen.getByLabelText("CPF"), "52998224725");
    await userEvent.type(screen.getByLabelText("WhatsApp de contato"), "11987654321");
    await userEvent.selectOptions(screen.getByLabelText("Conselho"), "crm");
    await userEvent.type(screen.getByLabelText("Número de registro"), "990001");
    await userEvent.selectOptions(screen.getByLabelText("UF"), "SP");
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continuar" }));

    // passo do aviso: sem a confirmação não segue, nem pede o Termo
    expect(await screen.findByRole("heading", { level: 1, name: "Aviso de Privacidade (texto fictício de teste)" })).toBeInTheDocument();
    expect(screen.getByText("Passo 3 de 5 · Aviso de Privacidade")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Texto do Aviso de Privacidade do Profissional" })).toHaveTextContent("Parágrafo fictício 2.");
    expect(await violacoesDoAxe(container)).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Confirme que leu o Aviso de Privacidade para continuar.");
    expect(acoes.carregarTermo).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Li o Aviso de Privacidade do Profissional."));
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // Termo, senha e envio, com a versão confirmada
    expect(await screen.findByRole("heading", { level: 1, name: TERMO.titulo })).toBeInTheDocument();
    expect(screen.getByText("Passo 4 de 5 · Assinatura")).toBeInTheDocument();
    const quadro = document.querySelector("canvas")!;
    fireEvent.pointerDown(quadro, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(quadro, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(quadro, { pointerId: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Assinar o termo" }));
    await userEvent.type(await screen.findByLabelText("Senha"), "2468");
    await userEvent.type(screen.getByLabelText("Confirme a senha"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Concluir o PROpass" }));
    expect(await screen.findByRole("heading", { name: "PROpass concluído" })).toBeInTheDocument();
    expect(screen.getByText("Passo 5 de 5 · Como você recebe documentos")).toBeInTheDocument();
    expect(acoes.enviarPropass.mock.calls[0]![0].avisoDePrivacidade).toBe("aviso-teste-v1");
  });
});
