import { describe, expect, it } from "vitest";
import { dadosSchema } from "./schema";

const BASE = { nome: "Bruna Reis", cpf: "529.982.247-25", whatsapp: "(11) 98765-4321", conselho: "crm", numero: "201.577", uf: "SP" };

describe("dadosSchema", () => {
  it("normaliza CPF, WhatsApp e número só para dígitos", () => {
    expect(dadosSchema.parse(BASE)).toEqual({ ...BASE, cpf: "52998224725", whatsapp: "11987654321", numero: "201577" });
  });
  it("recusa conselho fora da lista, UF inexistente, CPF inválido e nome de um termo", () => {
    for (const ruim of [{ conselho: "oab" }, { uf: "XX" }, { cpf: "52998224724" }, { nome: "Bruna" }, { numero: "" }]) {
      expect(dadosSchema.safeParse({ ...BASE, ...ruim }).success).toBe(false);
    }
  });
});
