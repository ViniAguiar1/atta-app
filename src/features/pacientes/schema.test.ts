import { describe, expect, it } from "vitest";
import { buscaSchema, cadastroSchema, celularComDdd, cursorSchema, nascimentoIso, termoPronto } from "./schema";

describe("bordas da lista de Pacientes", () => {
  it("busca só com 2+ letras do nome ou o CPF inteiro", () => {
    expect(termoPronto("j")).toBe(false);
    expect(termoPronto("ju")).toBe(true);
    expect(termoPronto("529.982")).toBe(false);
    expect(termoPronto("529.982.247-25")).toBe(true);
    expect(termoPronto("   ")).toBe(false);
  });

  it("o cursor é fechado e o termo tem limite", () => {
    expect(cursorSchema.safeParse({ nome: "Ana", id: "5a5a0000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(cursorSchema.safeParse({ nome: "Ana", id: "x" }).success).toBe(false);
    expect(cursorSchema.safeParse({ nome: "Ana", id: "5a5a0000-0000-4000-8000-000000000001", cpf: "1" }).success).toBe(false);
    expect(buscaSchema.safeParse({ termo: "a".repeat(101) }).success).toBe(false);
  });
});

describe("Novo paciente: bordas", () => {
  const base = {
    documento: { tipo: "cpf", numero: "529.982.247-25" }, nomeCivil: "Juliana Prates", nomeSocial: "",
    nascimento: "17/09/1990", celular: "(11) 98765-4321", email: "",
  };
  it("data válida, não futura, a partir de 1900", () => {
    const hoje = new Date("2026-11-20T12:00:00Z");
    expect(nascimentoIso("17/09/1990", hoje)).toBe("1990-09-17");
    expect(nascimentoIso("31/02/1990", hoje)).toBe(null);
    expect(nascimentoIso("21/11/2026", hoje)).toBe(null);
    expect(nascimentoIso("01/01/1899", hoje)).toBe(null);
    expect(nascimentoIso("1990-09-17", hoje)).toBe(null);
  });
  it("celular com DDD", () => {
    expect(celularComDdd("(11) 98765-4321")).toBe(true);
    expect(celularComDdd("98765-4321")).toBe(false);
    expect(celularComDdd("(05) 98765-4321")).toBe(false);
  });
  it("cadastro: nome e sobrenome, social e e-mail opcionais, CPF só com dígitos", () => {
    const ok = cadastroSchema.safeParse(base);
    expect(ok.success && ok.data).toMatchObject({ documento: { tipo: "cpf", numero: "52998224725" }, nomeSocial: null, email: null, celular: "11987654321", nascimento: "1990-09-17" });
    expect(cadastroSchema.safeParse({ ...base, nomeCivil: "Juliana" }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, email: "nao-e-email" }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });
});
