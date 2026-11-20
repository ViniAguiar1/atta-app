import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estadoDeDados } from "@/components/ui/DataState";
import type { Parametro } from "@/server/configuracoes/porta";
import { TelaAgendamentos } from "./TelaAgendamentos";

const acoes = vi.hoisted(() => ({ salvarParametro: vi.fn() }));
vi.mock("../actions", () => acoes);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const int = (chave: Parametro["chave"], valor: number, extra: Partial<Extract<Parametro, { tipo: "int" }>> = {}): Parametro => ({
  chave, tipo: "int", valor, padrao: valor, origem: "sistema", min: 0, max: 999, permitidos: null, ...extra,
});
const PARAMETROS: Parametro[] = [
  int("link_envio_antecedencia_h", 3, { min: 1, max: 24 }),
  int("link_validade_apos_h", 1, { min: 0, max: 4 }),
  int("lembrete_1_min", 60, { min: 15, max: 240 }),
  int("lembrete_2_min", 30, { min: 5, max: 120 }),
  int("janela_de_confirmacao_h", 72, { min: 1, max: 720 }),
  int("tolerancia_da_ausencia_min", 120, { min: null, max: null, permitidos: [0, 15, 30, 60, 90, 120] }),
];
const abrir = (r: Parameters<typeof TelaAgendamentos>[0]["resultado"] = { ok: true, data: PARAMETROS }) => render(<TelaAgendamentos resultado={r} />);

describe("Configurações › Agendamentos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("os estados do DataState: carregando, erro e pronto", () => {
    const { container, unmount } = abrir(null);
    expect(estadoDeDados(container)).toBe("carregando");
    unmount();
    const erro = abrir({ ok: false, error: { code: "INDISPONIVEL", message: "x" } });
    expect(estadoDeDados(erro.container)).toBe("erro");
    erro.unmount();
    expect(estadoDeDados(abrir().container)).toBe("pronto");
  });

  it("mostra os cartões e os textos do simulador, com a validade total", () => {
    abrir();
    const link = screen.getByRole("region", { name: "Link Check-in Online" });
    expect(within(link).getByLabelText("Enviar o link (horas antes)")).toHaveValue("3");
    expect(within(link).getByText("Validade total do link: 4 h")).toBeInTheDocument();
    expect(within(link).getByText(/3 h antes até 1 h depois do horário/)).toBeInTheDocument();
    const ausencia = screen.getByLabelText("Marcar o paciente como ausente quando não fizer o check-in até");
    expect(ausencia).toHaveDisplayValue("2 h depois do horário");
    expect(within(ausencia).getAllByRole("option").map((o) => o.textContent)).toContain("Não marcar automaticamente");
  });

  it("salva ao sair do campo e atualiza a validade total", async () => {
    acoes.salvarParametro.mockResolvedValue({ ok: true, data: int("link_envio_antecedencia_h", 5, { origem: "unidade" }) });
    abrir();
    const envio = screen.getByLabelText("Enviar o link (horas antes)");
    await userEvent.clear(envio);
    await userEvent.type(envio, "5");
    await userEvent.tab();
    expect(acoes.salvarParametro).toHaveBeenCalledWith({ chave: "link_envio_antecedencia_h", valor: 5 });
    expect(await screen.findByText("Salvo.")).toBeInTheDocument();
    expect(screen.getByText("Validade total do link: 6 h")).toBeInTheDocument();
  });

  it("a recusa do banco aparece no campo, com o que fazer", async () => {
    acoes.salvarParametro.mockResolvedValueOnce({ ok: false, error: { code: "VALIDACAO", message: "x" } });
    acoes.salvarParametro.mockResolvedValueOnce({ ok: false, error: { code: "CONFLITO", message: "x", reason: "ATTA-IN-0003:lembrete_2_min" } });
    abrir();
    const janela = screen.getByLabelText("Abrir a confirmação (horas antes)");
    await userEvent.clear(janela);
    await userEvent.type(janela, "900{Enter}");
    expect(await screen.findByText("Use um valor de 1 a 720.")).toBeInTheDocument();
    expect(janela).toHaveAttribute("aria-invalid", "true");
    const lembrete2 = screen.getByLabelText("Segundo lembrete (min antes)");
    await userEvent.clear(lembrete2);
    await userEvent.type(lembrete2, "90{Enter}");
    expect(await screen.findByText(/O segundo lembrete precisa vir depois do primeiro/)).toBeInTheDocument();
  });

  it("texto que não é número não vai ao servidor", async () => {
    abrir();
    const janela = screen.getByLabelText("Abrir a confirmação (horas antes)");
    await userEvent.clear(janela);
    await userEvent.type(janela, "7a{Enter}");
    expect(screen.getByText("Use só números inteiros.")).toBeInTheDocument();
    expect(acoes.salvarParametro).not.toHaveBeenCalled();
  });

  it("a lista salva ao escolher", async () => {
    acoes.salvarParametro.mockResolvedValue({ ok: true, data: PARAMETROS[5] });
    abrir();
    await userEvent.selectOptions(screen.getByLabelText("Marcar o paciente como ausente quando não fizer o check-in até"), "30");
    expect(acoes.salvarParametro).toHaveBeenCalledWith({ chave: "tolerancia_da_ausencia_min", valor: 30 });
  });
});
