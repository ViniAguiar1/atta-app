import { describe, expect, it } from "vitest";
import { termoPronto } from "./schema";

describe("termoPronto", () => {
  it("busca só com 2+ letras do nome ou o CPF inteiro, nunca prefixo de CPF", () => {
    expect(termoPronto("j")).toBe(false);
    expect(termoPronto("ju")).toBe(true);
    expect(termoPronto("Ângela")).toBe(true);
    expect(termoPronto("431.572")).toBe(false);
    expect(termoPronto("4315728012")).toBe(false);
    expect(termoPronto("431.572.801-20")).toBe(true);
    expect(termoPronto("43157280120")).toBe(true);
    expect(termoPronto("   ")).toBe(false);
  });
});
