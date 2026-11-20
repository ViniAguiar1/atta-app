import { describe, expect, it } from "vitest";
import { codigoSchema, cpfValido, identificacaoSchema, mascararCpf } from "./schema";

// CPFs gerados para teste (dígito verificador válido, ninguém real).
describe("CPF", () => {
  it("aceita CPF com dígitos válidos, com ou sem pontuação", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("11144477735")).toBe(true);
  });

  it("recusa dígito errado, tamanho errado e números repetidos", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("5299822472")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });

  it("mascara durante a digitação e na colagem", () => {
    expect(mascararCpf("529")).toBe("529");
    expect(mascararCpf("5299822")).toBe("529.982.2");
    expect(mascararCpf("52998224725999")).toBe("529.982.247-25");
  });

  it("a identificação devolve só os dígitos e recusa portal com caractere estranho", () => {
    expect(identificacaoSchema.parse({ portal: "aurora", cpf: "529.982.247-25" }).cpf).toBe("52998224725");
    expect(identificacaoSchema.safeParse({ portal: "../x", cpf: "52998224725" }).success).toBe(false);
  });
});

describe("código", () => {
  it("exige 6 números e desafio uuid", () => {
    const desafio = "00000001-1111-4111-8111-111111111111";
    expect(codigoSchema.safeParse({ desafio, codigo: "123456" }).success).toBe(true);
    expect(codigoSchema.safeParse({ desafio, codigo: "12345" }).success).toBe(false);
    expect(codigoSchema.safeParse({ desafio: "x", codigo: "123456" }).success).toBe(false);
  });
});
