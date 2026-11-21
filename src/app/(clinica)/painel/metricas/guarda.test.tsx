import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessaoDoPainel } from "@/features/casca/sessao";

const sessao = vi.fn<() => Promise<SessaoDoPainel | null>>();
const redirect = vi.fn((destino: string) => {
  throw new Error(`redirect:${destino}`);
});
vi.mock("@/features/casca/sessao", () => ({ sessaoDoPainel: () => sessao() }));
vi.mock("next/navigation", () => ({ redirect: (d: string) => redirect(d) }));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { GuardaDeMetricas } = await import("./guarda");

const base: SessaoDoPainel = { clinica: "Clínica Fictícia", pessoa: { nome: "Ana Exemplo" }, papel: "COLABORADOR", permissoes: [], notificacoes: 0 };
const abrir = () => GuardaDeMetricas({ children: "painel" });

beforeEach(() => {
  sessao.mockReset();
  redirect.mockClear();
});

// PDD v206 §10.4.3: "Métricas liberável ao Colaborador: decisão da PO" (❌ do Tech Lead no #201)
describe("guarda de Métricas (MIG-46)", () => {
  it("o ADMIN abre", async () => {
    sessao.mockResolvedValue({ ...base, papel: "ADMIN" });
    await expect(abrir()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("o Colaborador com metrics.view na própria matriz abre", async () => {
    sessao.mockResolvedValue({ ...base, permissoes: ["appointments.view", "metrics.view"] });
    await expect(abrir()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("o Colaborador sem metrics.view, e quem está sem sessão, voltam ao /painel", async () => {
    for (const s of [{ ...base, permissoes: ["appointments.view", "atta.view"] }, null]) {
      sessao.mockResolvedValue(s);
      await expect(abrir()).rejects.toThrow("redirect:/painel");
    }
  });
});
