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

describe("CNPJ, CEP e telefone fixo (Perfil da Clínica)", async () => {
  const { cnpjValido, mascararCnpj, mascararCep, mascararTelefone } = await import("./documentos");
  it("CNPJ pelo dígito verificador, com ou sem pontuação", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true); // CNPJ de exemplo, fictício
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });

  it("máscaras de digitação", () => {
    expect(mascararCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararCnpj("1122")).toBe("11.22");
    expect(mascararCep("01310930")).toBe("01310-930");
    expect(mascararTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascararTelefone("11999998888")).toBe("(11) 99999-8888");
  });
});
