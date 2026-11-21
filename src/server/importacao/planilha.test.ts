import { describe, expect, it } from "vitest";
import { analisarPlanilha, COLUNAS, LIMITE_LINHAS, normalizarCpf } from "./planilha";

// Só dado fictício: CPFs gerados (válidos só pelo dígito) e nomes inventados.
const HOJE = new Date("2026-11-21T12:00:00Z");
const CAB = [...COLUNAS];
const ABAS = ["Leia primeiro", "Pacientes"];
const analisar = (linhas: string[][], cab: readonly string[] = CAB, abas = ABAS) =>
  analisarPlanilha(abas, cab, linhas, HOJE);

describe("modelo da planilha (PDD §10.1)", () => {
  it("sem a aba Pacientes ou sem os 5 títulos, recusa inteiro", () => {
    expect(analisar([], CAB, ["Planilha1"])).toEqual({ ok: false, motivo: "fora_do_modelo" });
    expect(analisar([], ["Nome", "Documento"])).toEqual({ ok: false, motivo: "fora_do_modelo" });
  });

  it("aceita títulos com outra caixa, espaços e colunas a mais (descartadas)", () => {
    const r = analisar(
      [["x", "Maria Fictícia", "529.982.247-25", "", "", ""]],
      ["Observação", " nome  COMPLETO ", "cpf", "Data de Nascimento", "celular", "e-mail"],
    );
    expect(r.ok && r.validos).toEqual([{ line: 2, nomeCompleto: "Maria Fictícia", cpf: "52998224725" }]);
  });

  it("mais linhas que o limite: recusa sem ler", () => {
    const muitas = Array.from({ length: LIMITE_LINHAS + 1 }, () => ["A Fictícia", "529.982.247-25", "", "", ""]);
    expect(analisar(muitas)).toEqual({ ok: false, motivo: "linhas_demais" });
  });
});

describe("linhas", () => {
  it("nome e CPF obrigatórios; CPF inválido não entra; linha vazia não conta", () => {
    const r = analisar([
      ["", "111.444.777-35", "", "", ""],
      ["João Fictício", "", "", "", ""],
      ["Ana Fictícia", "529.982.247-24", "", "", ""],
      ["", "", "", "", ""],
    ]);
    expect(r.ok && r.errors).toEqual([
      { line: 2, code: "nome_ausente" },
      { line: 3, code: "cpf_ausente" },
      { line: 4, code: "cpf_invalido" },
    ]);
    expect(r.ok && r.total).toBe(3);
  });

  it("CPF sem zero à esquerda, data em número do Excel, celular com +55 e e-mail em minúsculas", () => {
    expect(normalizarCpf("1234567890")).toBe("01234567890");
    const r = analisar([["Pedro Fictício", "1234567890", "32947", "+55 (11) 91234-0001", "Pedro@Exemplo.TEST"]]);
    expect(r.ok && r.validos[0]).toEqual({
      line: 2,
      nomeCompleto: "Pedro Fictício",
      cpf: "01234567890",
      nascimento: "1990-03-15",
      celular: "+5511912340001",
      email: "pedro@exemplo.test",
    });
  });

  it("opcional fora da forma entra em branco, com aviso por linha e campo (não é erro)", () => {
    const r = analisar([["Lia Fictícia", "390.533.447-05", "31/02/1990", "1234", "nao-e-email"]]);
    expect(r.ok && r.validos).toEqual([{ line: 2, nomeCompleto: "Lia Fictícia", cpf: "39053344705" }]);
    expect(r.ok && r.blanked).toEqual([
      { line: 2, field: "nascimento" },
      { line: 2, field: "celular" },
      { line: 2, field: "email" },
    ]);
    expect(r.ok && r.errors).toEqual([]);
  });

  it("ano solto (4 dígitos) não vira data: entra em branco, com aviso", () => {
    const r = analisar([["Rita Fictícia", "529.982.247-25", "1990", "", ""]]);
    expect(r.ok && r.validos[0]?.nascimento).toBeUndefined();
    expect(r.ok && r.blanked).toEqual([{ line: 2, field: "nascimento" }]);
  });

  it("nome com 1 ou com mais de 200 caracteres não entra", () => {
    const r = analisar([
      ["A", "529.982.247-25", "", "", ""],
      ["B".repeat(201), "111.444.777-35", "", "", ""],
    ]);
    expect(r.ok && r.errors).toEqual([
      { line: 2, code: "nome_invalido" },
      { line: 3, code: "nome_invalido" },
    ]);
  });

  it("nascimento no futuro entra em branco", () => {
    const r = analisar([["Bebê Fictício", "529.982.247-25", "01/01/2030", "", ""]]);
    expect(r.ok && r.blanked).toEqual([{ line: 2, field: "nascimento" }]);
  });

  it("CPF repetido igual: fica a primeira; repetido diferente: nenhuma entra (e sem aviso de campo)", () => {
    const r = analisar([
      ["Lia Fictícia", "390.533.447-05", "", "", ""],
      ["lia  fictícia", "39053344705", "", "", ""],
      ["Rui Fictício", "529.982.247-25", "", "1234", ""],
      ["Rui Outro", "529.982.247-25", "", "", ""],
    ]);
    expect(r.ok && r.validos.map((v) => v.line)).toEqual([2]);
    expect(r.ok && r.errors).toEqual([
      { line: 3, code: "cpf_repetido_na_planilha" },
      { line: 4, code: "repetido_diferente" },
      { line: 5, code: "repetido_diferente" },
    ]);
    expect(r.ok && r.blanked).toEqual([]);
  });

  it("erro nunca leva o conteúdo da linha", () => {
    const r = analisar([["Nome Secreto Fictício", "529.982.247-24", "", "(11) 91234-0001", "x@exemplo.test"]]);
    expect(JSON.stringify(r)).not.toMatch(/Secreto|52998224724|91234|exemplo/);
  });
});
