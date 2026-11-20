import { describe, expect, it } from "vitest";
import { falhaPorStatusHttp } from "./resultado-provedor";

describe("falhaPorStatusHttp", () => {
  it("classifica pelo status: repetir, corrigir a conta ou desistir", () => {
    const tipo = (s: number) => {
      const r = falhaPorStatusHttp(s, "teste");
      return r.ok ? null : r.falha.tipo;
    };
    expect([401, 403].map(tipo)).toEqual(["configuracao", "configuracao"]);
    expect([408, 409, 429, 500, 503].map(tipo)).toEqual(Array(5).fill("transitoria"));
    expect([400, 404, 422].map(tipo)).toEqual(["permanente", "permanente", "permanente"]);
  });
});
