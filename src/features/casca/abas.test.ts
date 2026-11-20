import { describe, expect, it } from "vitest";
import { abaAtiva, abasDoPapel } from "./abas";

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

  it("Colaborador e quem está sem papel não veem Configurações nem Métricas (Métricas liberável no MIG-06)", () => {
    for (const papel of ["COLABORADOR", null] as const) {
      const rotulos = abasDoPapel(papel).map((a) => a.rotulo);
      expect(rotulos).toEqual(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA"]);
    }
  });

  it("a aba ativa é a do segmento depois de /painel", () => {
    expect(abaAtiva("/painel/configuracoes/agendamentos")?.rotulo).toBe("Configurações");
    expect(abaAtiva("/painel/agenda")?.rotulo).toBe("Agendamentos");
    expect(abaAtiva("/painel/agenda-antiga")).toBeUndefined();
  });
});
