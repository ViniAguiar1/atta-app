import { describe, expect, it } from "vitest";
import { PAINEL_VAZIO, painelDeMetricasSchema } from "@/features/metricas/schema";
import { escolherPortaMetricas } from "./porta";

describe("porta de Métricas (MIG-46)", () => {
  it("na produção, sem leitura real, o Painel vem vazio: todos os números nulos, nada inventado", async () => {
    const r = await escolherPortaMetricas("production").painel();
    expect(r).toEqual({ ok: true, data: PAINEL_VAZIO });
  });

  it("na prévia, no local e no CI vem a simulada, que passa pelo mesmo schema da real", async () => {
    for (const ambiente of ["preview", "development", undefined]) {
      const r = await escolherPortaMetricas(ambiente).painel();
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(painelDeMetricasSchema.parse(r.data)).toEqual(r.data);
        expect(r.data.atendimentosValidosHoje).not.toBeNull();
      }
    }
  });
});
