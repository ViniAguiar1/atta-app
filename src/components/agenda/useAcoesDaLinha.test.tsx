import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { falha, ok } from "@/lib/errors";
import type { Acao, Status } from "@/lib/agenda/linha";
import { useAcoesDaLinha, type ExecutarAcao } from "./useAcoesDaLinha";

// O hook comum das ações da linha (Agenda e Pasta): grava direto ou abre o diálogo, anuncia e chama o depoisDeGravar.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const ID = "00000000-0000-4000-8000-000000000001";

function Banco({ executar, depois, acao, status }: { executar: ExecutarAcao; depois: () => void; acao: Acao; status: Status }) {
  const { acionando, aviso, acionar, dialogoDaAcao } = useAcoesDaLinha({ executar, depoisDeGravar: depois });
  return (
    <div>
      <button type="button" onClick={() => void acionar({ id: ID, status }, acao)}>
        agir
      </button>
      <p data-testid="acionando">{acionando ?? ""}</p>
      {aviso && <p data-testid={`aviso-${aviso.tipo}`}>{aviso.texto}</p>}
      {dialogoDaAcao}
    </div>
  );
}

describe("useAcoesDaLinha", () => {
  it("Confirmar grava direto, anuncia o feito e chama o depoisDeGravar", async () => {
    const executar = vi.fn(async () => ok(null));
    const depois = vi.fn();
    render(<Banco executar={executar} depois={depois} acao="confirmar" status="agendado" />);
    await userEvent.click(screen.getByRole("button", { name: "agir" }));
    expect(executar).toHaveBeenCalledWith({ acao: "confirmar", id: ID });
    expect(screen.getByTestId("aviso-ok")).toHaveTextContent("Agendamento confirmado.");
    expect(depois).toHaveBeenCalledWith("confirmar");
  });

  it("erro vem do code/reason, nunca da message", async () => {
    const executar = vi.fn(async () => falha("CONFLITO", "mensagem do servidor", undefined, "ATTA-IN-0003:absent_day"));
    render(<Banco executar={executar} depois={vi.fn()} acao="marcar_ausente" status="agendado" />);
    await userEvent.click(screen.getByRole("button", { name: "agir" }));
    expect(screen.getByTestId("aviso-erro")).toHaveTextContent("Só dá para marcar como ausente no dia do atendimento.");
    expect(screen.getByTestId("aviso-erro")).not.toHaveTextContent("mensagem do servidor");
  });

  it("Cancelar depois da chegada abre o diálogo com os motivos de depois; o erro fica no diálogo", async () => {
    const executar = vi.fn(async () => falha("VALIDACAO", "x", undefined, "ATTA-IN-0001:reason"));
    const depois = vi.fn();
    render(<Banco executar={executar} depois={depois} acao="cancelar" status="pronto" />);
    await userEvent.click(screen.getByRole("button", { name: "agir" }));
    const dialogo = screen.getByRole("dialog", { name: "Cancelar agendamento" });
    expect(within(dialogo).getAllByRole("radio")).toHaveLength(5); // MOTIVOS_CANCELAR_DEPOIS
    await userEvent.click(within(dialogo).getAllByRole("radio")[0]!);
    await act(async () => {
      await userEvent.click(within(dialogo).getByRole("button", { name: "Cancelar agendamento" }));
    });
    expect(executar).toHaveBeenCalledWith({ acao: "cancelar", id: ID, motivo: "paciente_desistiu" });
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Escolha um motivo da lista.");
    expect(depois).not.toHaveBeenCalled();
  });
});
