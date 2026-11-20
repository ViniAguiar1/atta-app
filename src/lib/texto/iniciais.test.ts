import { describe, expect, it } from "vitest";
import { iniciais } from "./iniciais";

describe("iniciais", () => {
  it("primeira letra do primeiro e do último nome, como no avatar do Simulador ATTA-in", () => {
    expect(iniciais("  Marina   Teste Fictícia ")).toBe("MF");
    expect(iniciais("Ana")).toBe("A");
    expect(iniciais("")).toBe("");
  });
});
