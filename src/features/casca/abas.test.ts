import { describe, expect, it } from "vitest";
import { ABAS, abaAtiva, abasDoPapel, MODULOS_PRONTOS, moduloDisponivel } from "./abas";

const TODAS = ABAS.map((a) => a.href);

// MIG-40: as abas da casca por papel (PDD v206 §10.4.3) e a aba ativa pela rota.
describe("abas da casca", () => {
  it("ADMIN vê as seis abas, na ordem do simulador", () => {
    expect(abasDoPapel("ADMIN", TODAS).map((a) => a.rotulo)).toEqual([
      "Agendamentos",
      "Pacientes",
      "Termos & Docs",
      "ATTA",
      "Métricas",
      "Configurações",
    ]);
  });

  it("Colaborador e quem está sem papel não veem Configurações nem Métricas (Métricas liberável no MIG-06)", () => {
    for (const papel of ["COLABORADOR", null] as const) {
      const rotulos = abasDoPapel(papel, TODAS).map((a) => a.rotulo);
      expect(rotulos).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA"]);
    }
  });

  it("aba de módulo sem tela pronta não aparece (regra do stage)", () => {
    expect(abasDoPapel("ADMIN", ["/painel/configuracoes"]).map((a) => a.rotulo)).toEqual(["Configurações"]);
    expect(abasDoPapel("ADMIN").map((a) => a.href)).toEqual(ABAS.map((a) => a.href).filter((h) => MODULOS_PRONTOS.includes(h)));
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
