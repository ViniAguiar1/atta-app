import { describe, expect, it } from "vitest";
import { buscaSchema, cursorSchema, termoPronto } from "./schema";

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
