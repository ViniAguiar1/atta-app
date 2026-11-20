import { describe, expect, it } from "vitest";
import { camposPendentes, celularValido, mascararCelular, mascararCep, nomeValido, type DadosEditaveis } from "./schema";

// Validações do PDD v206 §16.6. Dados inventados.
const completo: DadosEditaveis = {
  nome: "Helena Prado Antunes",
  nomeSocial: "",
  celular: "(11) 98765-4321",
  email: "",
  cep: "01310-100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  complemento: "",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "SP",
};

describe("§16.6", () => {
  it("nome precisa de dois termos", () => {
    expect(nomeValido("Helena Prado")).toBe(true);
    expect(nomeValido("Helena")).toBe(false);
    expect(nomeValido("Helena P")).toBe(false);
  });

  it("celular com DDD válido, 11 dígitos e 9 na frente", () => {
    expect(celularValido("(11) 98765-4321")).toBe(true);
    expect(celularValido("(20) 98765-4321")).toBe(false); // DDD 20 não existe
    expect(celularValido("(11) 8765-4321")).toBe(false);
  });

  it("e-mail vazio não bloqueia (há celular); e-mail mal formado bloqueia", () => {
    expect(camposPendentes(completo)).toEqual([]);
    expect(camposPendentes({ ...completo, email: "helena@" })).toEqual(["email"]);
  });

  it("aponta todos os campos que bloqueiam o avanço", () => {
    expect(camposPendentes({ ...completo, nome: "Helena", numero: "", cep: "0131" }).sort()).toEqual(["cep", "nome", "numero"]);
  });

  it("máscaras de celular e CEP", () => {
    expect(mascararCelular("11987654321")).toBe("(11) 98765-4321");
    expect(mascararCelular("119")).toBe("(11) 9");
    expect(mascararCep("01310100")).toBe("01310-100");
  });
});
