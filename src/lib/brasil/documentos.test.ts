import { describe, expect, it } from "vitest";
import { celularValido, cnpjValido, cpfValido, formatarCnpj, mascararCelular, mascararCpf, nomeValido, normalizarCnpj } from "./documentos";

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

// Vetores gerados (ninguém real), numéricos e alfanuméricos; o "12ABC34501DE35" é o exemplo publicado pela Receita.
describe("CNPJ alfanumérico (IN RFB 2.229/2024; ADR 0001)", () => {
  it("válidos, numéricos e com letras, com ou sem pontuação e em minúsculas", () => {
    for (const c of ["48309271000150", "48.309.271/0001-50", "12ABC34501DE35", "12.ABC.345/01DE-35", "12.abc.345/01de-35", "A1B2C3D4E5F668", "ZZZZZZZZ000191"]) {
      expect(cnpjValido(c), c).toBe(true);
    }
  });

  it("inválidos: DV errado, letra no DV, tamanho, caractere repetido e símbolo fora da máscara", () => {
    // "12ABC34501DE!35" e "12ABC34501D!35": o símbolo não sai na normalização, e o CNPJ é recusado (nota do FE2 no #291)
    for (const c of ["48309271000151", "12ABC34501DE36", "12ABC34501DE3A", "12ABC34501DE3", "12ABC34501DE355", "00000000000000", "AAAAAAAAAAAAAA", "12ABC34501DE!35", "12ABC34501D!35", "12ABC_34501DE35"]) {
      expect(cnpjValido(c), c).toBe(false);
    }
  });

  it("normaliza (maiúsculas, sem pontuação) e formata, inclusive enquanto digita", () => {
    expect(normalizarCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(normalizarCnpj("12 ABC 345 01DE 35")).toBe("12ABC34501DE35");
    expect(normalizarCnpj("12ABC34501DE!35")).toBe("12ABC34501DE!35");
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("48309271000150")).toBe("48.309.271/0001-50");
    expect(formatarCnpj("12ab")).toBe("12.AB");
    expect(formatarCnpj("12ABC34501")).toBe("12.ABC.345/01");
  });
});

describe("CNPJ, CEP e telefone fixo (Perfil da Clínica)", async () => {
  const { cnpjValido, mascararCep, mascararTelefone } = await import("./documentos");
  it("CNPJ pelo dígito verificador, com ou sem pontuação", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true); // CNPJ de exemplo, fictício
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
  });

  it("máscaras de digitação", () => {
    expect(mascararCep("01310930")).toBe("01310-930");
    expect(mascararTelefone("1133334444")).toBe("(11) 3333-4444");
    expect(mascararTelefone("11999998888")).toBe("(11) 99999-8888");
  });
});

describe("e-mail (Perfil da Clínica, §16.6)", async () => {
  const { emailValido } = await import("./documentos");
  it("estrutura válida", () => {
    expect(emailValido("contato@exemplo.test")).toBe(true);
    for (const e of ["nao-e-email", "a@b", "a @b.com", "@exemplo.test"]) expect(emailValido(e), e).toBe(false);
  });
});
