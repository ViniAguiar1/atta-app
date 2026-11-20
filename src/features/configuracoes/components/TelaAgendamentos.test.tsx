import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { estadoDeDados } from "@/components/ui/DataState";
import type { Parametro } from "@/server/configuracoes/porta";
import { TelaAgendamentos } from "./TelaAgendamentos";

const acoes = vi.hoisted(() => ({ salvarParametro: vi.fn(), adicionarCelular: vi.fn(), removerCelular: vi.fn() }));
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
  { chave: "fluxo_alternativo_habilitado", tipo: "bool", valor: true, padrao: true, origem: "sistema" },
];
const CELULAR = { id: "00000000-0000-4000-8000-0000000000c1", nome: "Celular da recepção", numeroMascarado: "(48) ·····-0001" };
const abrir = (r: Parameters<typeof TelaAgendamentos>[0]["resultado"] = { ok: true, data: { parametros: PARAMETROS, celulares: [CELULAR] } }) =>
  render(<TelaAgendamentos resultado={r} />);

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

  it("a lista salva logo depois de escolher, uma vez só, mesmo trocando pela seta", async () => {
    acoes.salvarParametro.mockResolvedValue({ ok: true, data: PARAMETROS[5] });
    abrir();
    const lista = screen.getByLabelText("Marcar o paciente como ausente quando não fizer o check-in até");
    await userEvent.selectOptions(lista, "90");
    await userEvent.selectOptions(lista, "30");
    await waitFor(() => expect(acoes.salvarParametro).toHaveBeenCalledTimes(1), { timeout: 1500 });
    expect(acoes.salvarParametro).toHaveBeenCalledWith({ chave: "tolerancia_da_ausencia_min", valor: 30 });
  });

  it("Fluxo alternativo: a caixa grava, e a recusa volta a caixa ao valor salvo", async () => {
    acoes.salvarParametro.mockResolvedValueOnce({ ok: false, error: { code: "SEM_PERMISSAO", message: "x" } });
    abrir();
    const caixa = screen.getByLabelText("Habilitar o Fluxo alternativo nesta clínica");
    expect(caixa).toBeChecked();
    await userEvent.click(caixa);
    expect(acoes.salvarParametro).toHaveBeenCalledWith({ chave: "fluxo_alternativo_habilitado", valor: false });
    expect(await screen.findByText("Só o gestor da clínica muda as Configurações.")).toBeInTheDocument();
    expect(caixa).toBeChecked();
  });

  it("celulares: mostra o número mascarado, remove e adiciona com a recusa no campo", async () => {
    acoes.removerCelular.mockResolvedValue({ ok: true, data: { id: CELULAR.id } });
    acoes.adicionarCelular
      .mockResolvedValueOnce({ ok: false, error: { code: "VALIDACAO", message: "x", fields: [{ campo: "numero", code: "VALIDACAO" }] } })
      .mockResolvedValueOnce({ ok: true, data: { id: "00000000-0000-4000-8000-0000000000c2", nome: "Tablet", numeroMascarado: "(11) ·····-5678" } });
    abrir();
    const fluxo = screen.getByRole("region", { name: "Fluxo alternativo" });
    expect(within(fluxo).getByText("(48) ·····-0001")).toBeInTheDocument();
    await userEvent.click(within(fluxo).getByRole("button", { name: "Remover Celular da recepção" }));
    expect(await within(fluxo).findByText("Nenhum celular cadastrado.")).toBeInTheDocument();
    await userEvent.click(within(fluxo).getByRole("button", { name: "+ Adicionar celular" }));
    expect(within(fluxo).getByLabelText("Nome do celular 1")).toHaveFocus();
    await userEvent.type(within(fluxo).getByLabelText("Nome do celular 1"), "Tablet");
    await userEvent.type(within(fluxo).getByLabelText("Número do celular 1"), "123");
    await userEvent.click(within(fluxo).getByRole("button", { name: "Salvar celular" }));
    expect(await within(fluxo).findByText(/Informe o celular com DDD/)).toBeInTheDocument();
    expect(within(fluxo).getByLabelText("Número do celular 1")).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(within(fluxo).getByRole("button", { name: "Salvar celular" }));
    expect(await within(fluxo).findByText("(11) ·····-5678")).toBeInTheDocument();
  });

  it("Envio das mensagens é só texto, do simulador", () => {
    abrir();
    expect(within(screen.getByRole("region", { name: "Envio das mensagens" })).getByText(/WhatsApp pela API oficial/)).toBeInTheDocument();
  });
});
