import { describe, expect, it } from "vitest";
import { CANAIS_VAZIOS, caixaSchema } from "@/features/notificacoes/schema";
import { escolherPortaNotificacoes } from "./porta";

describe("porta do sino (MIG-45)", () => {
  it("na produção, sem leitura real, a caixa vem vazia e os canais sem configuração", async () => {
    expect(await escolherPortaNotificacoes("production").caixa()).toEqual({ ok: true, data: { itens: [], canais: CANAIS_VAZIOS } });
  });

  it("na prévia, no local e no CI vem a simulada, pelo mesmo schema, sem palavra de saúde no texto", async () => {
    for (const ambiente of ["preview", "development", undefined]) {
      const r = await escolherPortaNotificacoes(ambiente).caixa();
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(caixaSchema.parse(r.data)).toEqual(r.data);
      expect(r.data.itens.length).toBeGreaterThan(0);
      // RN-NOT-01: o texto referencia o atendimento sem motivo, procedimento ou dado clínico
      expect(r.data.itens.map((n) => `${n.titulo} ${n.corpo}`).join(" ")).not.toMatch(/sa[úu]de|diagn|alerg|medica|doen[çc]a|toxina|preenchimento/i);
    }
  });
});
