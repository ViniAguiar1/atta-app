import { describe, expect, it } from "vitest";
import { ABAS, abaAtiva, abasDoPapel, MODULOS_PRONTOS, moduloDisponivel, podeAbrirAba } from "./abas";


// MIG-40: as abas da casca por papel (PDD v206 §10.4.3) e a aba ativa pela rota.
describe("abas da casca", () => {
  it("ADMIN vê as seis abas, na ordem do simulador", () => {
    expect(abasDoPapel("ADMIN").map((a) => a.rotulo)).toEqual([
      "Agendamentos",
      "Pacientes",
      "Termos & Docs",
      "ATTA",
      "Métricas",
      "Configurações",
    ]);
  });

  it("Colaborador sem metrics.view e quem está sem papel não veem Configurações nem Métricas", () => {
    for (const papel of ["COLABORADOR", null] as const) {
      const rotulos = abasDoPapel(papel, ["appointments.view", "atta.view"]).map((a) => a.rotulo);
      expect(rotulos).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA"]);
    }
  });

  it("Colaborador com metrics.view na própria matriz vê Métricas, nunca Configurações (PDD §10.4.3)", () => {
    expect(abasDoPapel("COLABORADOR", ["metrics.view"]).map((a) => a.rotulo)).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA", "Métricas"]);
    expect(podeAbrirAba("/painel/metricas", "COLABORADOR", ["metrics.view"])).toBe(true);
    expect(podeAbrirAba("/painel/configuracoes", "COLABORADOR", ["metrics.view"])).toBe(false);
    // sem papel, a permissão sozinha não abre nada de gestão
    expect(podeAbrirAba("/painel/metricas", null, ["metrics.view"])).toBe(false);
  });

  it("as abas do painel não dependem da lista de módulos prontos (decisão do dono, 20/11)", () => {
    expect(MODULOS_PRONTOS.some((h) => h.startsWith("/painel"))).toBe(false);
    expect(abasDoPapel("ADMIN").map((a) => a.href)).toEqual(ABAS.map((a) => a.href));
  });

  it("a aba ativa é a do segmento depois de /painel", () => {
    expect(abaAtiva("/painel/configuracoes/agendamentos")?.rotulo).toBe("Configurações");
    expect(abaAtiva("/painel/agenda")?.rotulo).toBe("Agendamentos");
    expect(abaAtiva("/painel/agenda-antiga")).toBeUndefined();
  });
});

describe("moduloDisponivel", () => {
  it("na produção, só com porta real; fora dela, também com a simulada", () => {
    const antes = process.env.VERCEL_ENV;
    try {
      process.env.VERCEL_ENV = "production";
      expect(moduloDisponivel("/painel/agenda", ["/painel/agenda"])).toBe(true);
      expect(moduloDisponivel("/painel/configuracoes", ["/painel/agenda"])).toBe(false);
      process.env.VERCEL_ENV = "preview";
      expect(moduloDisponivel("/painel/configuracoes", ["/painel/agenda"])).toBe(true);
    } finally {
      process.env.VERCEL_ENV = antes;
    }
  });
});
