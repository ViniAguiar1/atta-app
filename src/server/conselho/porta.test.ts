import { describe, expect, it } from "vitest";
import { conselhoSemConsulta, estadoDoConselhoParaOBanco, portaConselho } from "./porta";

const registro = { conselho: "cro" as const, numero: "12345", uf: "SP", nome: "Dra. Fictícia" };

describe("porta do conselho (Camada 1 do PROpass)", () => {
  it("sem consulta automática (R20), a porta ativa responde não consultado: nunca afirma a regularidade", async () => {
    expect(portaConselho).toBe(conselhoSemConsulta);
    expect(await portaConselho.conferir(registro)).toEqual({ situacao: "nao_consultado" });
  });

  it("o estado para o banco: regularizado e não consultado gravam; não confere nunca grava", () => {
    expect(estadoDoConselhoParaOBanco({ situacao: "regularizado", consultadoEm: "2026-11-21T12:00:00.000Z" })).toBe("regularizado");
    expect(estadoDoConselhoParaOBanco({ situacao: "nao_consultado" })).toBe("nao_consultado");
    expect(estadoDoConselhoParaOBanco({ situacao: "nao_confere" })).toBeNull();
  });
});
