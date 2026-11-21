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

  // o padrão do PDD ao convidar (§10.4.3): Agendamentos e Pacientes completos e ATTA (ver); Termos & Docs, nenhum
  const PADRAO = ["appointments.view", "appointments.create", "appointments.edit", "patients.view", "patients.create", "patients.edit", "atta.view"];

  it("Colaborador com o padrão do PDD vê Agendamentos, Pacientes e ATTA; nunca Termos & Docs sem documents.view (S2 da QA)", () => {
    expect(abasDoPapel("COLABORADOR", PADRAO).map((a) => a.rotulo)).toEqual(["Agendamentos", "Pacientes", "ATTA"]);
    expect(podeAbrirAba("/painel/documentos", "COLABORADOR", PADRAO)).toBe(false);
    expect(abasDoPapel("COLABORADOR", [...PADRAO, "documents.view"]).map((a) => a.rotulo)).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA"]);
  });

  it("cada aba de módulo some sem o visualizar do seu módulo", () => {
    const todas = ["appointments.view", "patients.view", "documents.view", "atta.view", "metrics.view"];
    const aba: Record<string, string> = {
      "appointments.view": "Agendamentos",
      "patients.view": "Pacientes",
      "documents.view": "Termos & Docs",
      "atta.view": "ATTA",
      "metrics.view": "Métricas",
    };
    for (const falta of todas) {
      const rotulos = abasDoPapel("COLABORADOR", todas.filter((p) => p !== falta)).map((a) => a.rotulo);
      expect(rotulos, falta).not.toContain(aba[falta]);
      expect(rotulos, falta).toHaveLength(4);
      expect(rotulos).not.toContain("Configurações");
    }
  });

  it("Métricas liberável ao Colaborador; Configurações nunca; sem papel, nenhuma aba", () => {
    expect(podeAbrirAba("/painel/metricas", "COLABORADOR", ["metrics.view"])).toBe(true);
    expect(podeAbrirAba("/painel/configuracoes", "COLABORADOR", ["metrics.view"])).toBe(false);
    expect(abasDoPapel(null, PADRAO)).toEqual([]);
    expect(abasDoPapel("COLABORADOR", [])).toEqual([]);
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
