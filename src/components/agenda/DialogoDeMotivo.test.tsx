import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DialogoDeMotivo } from "./DialogoDeMotivo";

// Diálogo de motivo (PDD §10.2.2 e §10.2.3). O jsdom não tem showModal: o <dialog> só abre.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

const MOTIVOS = ["cancelado_pelo_paciente", "cancelado_pela_clinica", "agendado_por_engano"] as const;

describe("DialogoDeMotivo", () => {
  it("abre como diálogo nomeado pelo título, com os motivos do PDD em chips (rádios)", () => {
    render(
      <DialogoDeMotivo titulo="Cancelar agendamento" texto="t" motivos={MOTIVOS} rotuloConfirmar="Cancelar agendamento" aoConfirmar={vi.fn()} aoFechar={vi.fn()} />,
    );
    expect(screen.getByRole("dialog", { name: "Cancelar agendamento" })).toBeDefined();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Cancelado pelo paciente",
      "Cancelado pela clínica",
      "Agendado por engano",
    ]);
  });

  it("sem motivo, não envia e avisa em alerta; com motivo, envia o código", () => {
    const aoConfirmar = vi.fn();
    render(
      <DialogoDeMotivo titulo="Cancelar agendamento" texto="t" motivos={MOTIVOS} rotuloConfirmar="Confirmar" aoConfirmar={aoConfirmar} aoFechar={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(aoConfirmar).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Escolha um motivo.");
    fireEvent.click(screen.getByRole("radio", { name: "Agendado por engano" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(aoConfirmar).toHaveBeenCalledWith({ motivo: "agendado_por_engano" });
  });

  it("justificativa de 50+: contagem regressiva anunciada e o envio só libera no mínimo, sem espaços sobrando", () => {
    const aoConfirmar = vi.fn();
    render(
      <DialogoDeMotivo
        titulo="Concluir pela recepção"
        texto="t"
        motivos={["profissional_inacessivel"]}
        rotuloConfirmar="Concluir atendimento"
        justificativaMinima={50}
        aoConfirmar={aoConfirmar}
        aoFechar={vi.fn()}
      />,
    );
    const campo = screen.getByRole("textbox", { name: "Justificativa" });
    const contagem = document.getElementById(campo.getAttribute("aria-describedby") ?? "");
    expect(contagem?.getAttribute("aria-live")).toBe("polite");
    expect(contagem?.textContent).toBe("Faltam 50 caracteres");
    fireEvent.click(screen.getByRole("radio", { name: "Profissional inacessível" }));
    fireEvent.change(campo, { target: { value: "curta" } });
    expect(contagem?.textContent).toBe("Faltam 45 caracteres");
    expect((screen.getByRole("button", { name: "Concluir atendimento" }) as HTMLButtonElement).disabled).toBe(true);
    const longa = "O profissional não consegue abrir o Boarding Check pelo celular.";
    fireEvent.change(campo, { target: { value: `  ${longa}  ` } });
    expect(contagem?.textContent).toBe("Mínimo de 50 caracteres atingido");
    fireEvent.click(screen.getByRole("button", { name: "Concluir atendimento" }));
    expect(aoConfirmar).toHaveBeenCalledWith({ motivo: "profissional_inacessivel", justificativa: longa });
  });

  it("Esc (cancel do dialog) e Voltar fecham; o erro do servidor aparece em alerta", () => {
    const aoFechar = vi.fn();
    render(
      <DialogoDeMotivo
        titulo="Cancelar agendamento"
        texto="t"
        motivos={MOTIVOS}
        rotuloConfirmar="Confirmar"
        erro="Este atendimento mudou de estado."
        aoConfirmar={vi.fn()}
        aoFechar={aoFechar}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe("Este atendimento mudou de estado.");
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(aoFechar).toHaveBeenCalledTimes(2);
  });
});
