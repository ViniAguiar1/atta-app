import { describe, expect, it } from "vitest";
import { celularValido, cpfValido, mascararCelular, mascararCpf, nomeValido } from "./documentos";

// CPFs e celulares gerados para teste (ninguém real).
describe("documentos", () => {
  it("CPF pelo dígito verificador e máscara de digitação", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("11111111111")).toBe(false);
    expect(mascararCpf("52998224725")).toBe("529.982.247-25");
  });
  it("celular com DDD válido e 9 na frente; máscara", () => {
    expect(celularValido("(11) 98765-4321")).toBe(true);
    expect(celularValido("(20) 98765-4321")).toBe(false);
    expect(mascararCelular("11987654321")).toBe("(11) 98765-4321");
  });
  it("nome com pelo menos dois termos", () => {
    expect(nomeValido("Bruna Reis")).toBe(true);
    expect(nomeValido("Bruna")).toBe(false);
  });
});
