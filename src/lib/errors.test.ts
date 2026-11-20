import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CODIGOS_DE_ERRO, falha, falhaDeValidacao, ok } from "./errors";

describe("errors", () => {
  it("ok e falha têm a forma do contrato das bordas", () => {
    expect(ok(1)).toEqual({ ok: true, data: 1 });
    expect(falha("NAO_ENCONTRADO", "Não encontrado.")).toEqual({
      ok: false,
      error: { code: "NAO_ENCONTRADO", message: "Não encontrado." },
    });
  });

  it("a lista de códigos é fechada e sem repetição", () => {
    expect(new Set(CODIGOS_DE_ERRO).size).toBe(CODIGOS_DE_ERRO.length);
  });

  it("erro do Zod vira VALIDACAO só com o caminho dos campos, nunca o valor recebido", () => {
    const cpfFicticio = "529.982.247-25";
    const r = z.object({ cpf: z.string().length(11), nome: z.string().min(3) }).safeParse({ cpf: cpfFicticio, nome: "A" });
    expect(r.success).toBe(false);
    const resultado = falhaDeValidacao(r.success ? [] : r.error.issues);
    expect(resultado).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(JSON.stringify(resultado)).not.toContain(cpfFicticio);
    expect(resultado.ok ? [] : resultado.error.fields?.map((f) => f.campo)).toEqual(["cpf", "nome"]);
  });
});
