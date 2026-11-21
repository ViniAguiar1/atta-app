import { describe, expect, it } from "vitest";
import { dadosSchema } from "./schema";

const BASE = { nome: "Bruna Reis", cpf: "529.982.247-25", whatsapp: "(11) 98765-4321", conselho: "crm", numero: "990.001", uf: "SP" };

describe("dadosSchema", () => {
  it("normaliza CPF, WhatsApp e número só para dígitos", () => {
    expect(dadosSchema.parse(BASE)).toEqual({ ...BASE, cpf: "52998224725", whatsapp: "11987654321", numero: "990001" });
  });
  it("recusa conselho fora da lista, UF inexistente, CPF inválido e nome de um termo", () => {
    for (const ruim of [{ conselho: "oab" }, { uf: "XX" }, { cpf: "52998224724" }, { nome: "Bruna" }, { numero: "" }, { nome: "Bruna {{Reis}}" }, { nome: "Bruna Reis }}" }]) {
      expect(dadosSchema.safeParse({ ...BASE, ...ruim }).success).toBe(false);
    }
  });
});

describe("pinObvio e envioSchema", async () => {
  const { pinObvio, envioSchema } = await import("./schema");
  it("recusa iguais e sequências de 4, crescentes e decrescentes", () => {
    for (const p of ["0000", "9999", "0123", "6789", "9876", "3210"]) expect(pinObvio(p)).toBe(true);
    for (const p of ["2468", "1357", "0124", "9875", "1122"]) expect(pinObvio(p)).toBe(false);
  });
  it("o envio exige a leitura até o fim, um PNG e um PIN que não seja óbvio", () => {
    const base = { dados: BASE, assinatura: "data:image/png;base64,iVBORw0KGgo=", leuAteOFim: true, pin: "2468" };
    expect(envioSchema.safeParse(base).success).toBe(true);
    for (const ruim of [{ leuAteOFim: false }, { pin: "1234" }, { assinatura: "data:image/jpeg;base64,AAAA" }]) {
      expect(envioSchema.safeParse({ ...base, ...ruim }).success).toBe(false);
    }
  });
});
