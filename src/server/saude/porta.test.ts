import { describe, expect, it } from "vitest";
import { formularioDoPacienteSchema, leituraDoFormularioSchema } from "@/lib/saude/schema";
import { escolherPortaSaude } from "./porta";

const HASH = Buffer.alloc(32, 1);

describe("porta do Formulário de Saúde (MIG-52)", () => {
  it("na produção, sem o MIG-22, tudo responde INDISPONIVEL: dado de saúde simulado nunca aparece", async () => {
    const porta = escolherPortaSaude("production");
    for (const r of [
      await porta.carregar(HASH),
      await porta.salvarResposta(HASH, { perguntaId: "00000000-0000-4000-8000-000000000001", recusada: true }),
      await porta.declarar(HASH),
      await porta.lerParaBoarding(HASH),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { code: "INDISPONIVEL" } });
    }
  });

  it("fora da produção, a simulada passa pelos schemas do contrato", async () => {
    const porta = escolherPortaSaude("preview");
    const formulario = await porta.carregar(HASH);
    const leitura = await porta.lerParaBoarding(HASH);
    expect(formulario.ok && formularioDoPacienteSchema.safeParse(formulario.data).success).toBe(true);
    expect(leitura.ok && leituraDoFormularioSchema.safeParse(leitura.data).success).toBe(true);
  });

  it("a anterior do 'pergunta a pergunta' traz só mês e ano, sem o estabelecimento", async () => {
    const r = await escolherPortaSaude("preview").carregar(HASH);
    if (!r.ok) throw new Error("simulada falhou");
    for (const anterior of Object.values(r.data.anteriores)) {
      expect(Object.keys(anterior.respondidaEm).sort()).toEqual(["ano", "mes"]);
      expect(JSON.stringify(anterior)).not.toMatch(/clinica|estabelecimento|tenant/i);
    }
  });
});
