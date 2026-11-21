import { describe, expect, it } from "vitest";
import { contagem, duracao, extras, horas, percentual } from "./formato";

describe("formatos do Painel de Métricas (captura 40)", () => {
  it("duração em minutos e segundos", () => {
    expect(duracao(207)).toBe("3m 27s");
    expect(duracao(150)).toBe("2m 30s");
    expect(duracao(45)).toBe("45s");
    expect(duracao(120)).toBe("2m 0s");
    expect(duracao(null)).toBeNull();
  });

  it("horas, extras com sinal, contagem e percentual", () => {
    expect(horas(156)).toBe("156 h");
    expect(extras(213)).toBe("+213");
    expect(extras(0)).toBe("0");
    expect(contagem(1151)).toBe("1.151");
    expect(percentual(2, 2)).toBe("100%");
    expect(percentual(1, 3)).toBe("33%");
    expect([horas(null), extras(null), contagem(null)]).toEqual([null, null, null]);
  });
});
