import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CODIGOS_DE_ERRO,
  MENSAGENS,
  falha,
  falhaDeValidacao,
  falhaDoBanco,
  lerReason,
  ok,
  reasonDoBanco,
  type CodigoDeErro,
  type ErroDoBanco,
} from "./errors";

describe("errors", () => {
  it("ok e falha têm a forma do contrato das bordas", () => {
    expect(ok(1)).toEqual({ ok: true, data: 1 });
    expect(falha("NAO_ENCONTRADO", "Não encontrado.")).toEqual({
      ok: false,
      error: { code: "NAO_ENCONTRADO", message: "Não encontrado." },
    });
    expect(falha("CONFLITO", "x", undefined, "ATTA-IN-0003")).toEqual({
      ok: false,
      error: { code: "CONFLITO", message: "x", reason: "ATTA-IN-0003" },
    });
  });

  it("a lista de códigos é fechada e sem repetição, cada uma com a sua mensagem", () => {
    expect(new Set(CODIGOS_DE_ERRO).size).toBe(CODIGOS_DE_ERRO.length);
    expect(Object.keys(MENSAGENS).sort()).toEqual([...CODIGOS_DE_ERRO].sort());
  });

  it("erro do Zod vira VALIDACAO só com o caminho dos campos, nunca o valor recebido", () => {
    const cpfFicticio = "529.982.247-25";
    const r = z.object({ cpf: z.string().length(11), nome: z.string().min(3) }).safeParse({ cpf: cpfFicticio, nome: "A" });
    expect(r.success).toBe(false);
    const resultado = falhaDeValidacao(r.success ? [] : r.error.issues);
    expect(resultado).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(JSON.stringify(resultado)).not.toContain(cpfFicticio);
    expect(resultado.ok ? [] : resultado.error.fields?.map((f) => f.campo)).toEqual(["cpf", "nome"]);
  });
});

// Formas que o PostgREST devolve para o `raise exception using errcode, message, detail` das migrations
// (ex.: 20261120150000_api_patient.sql) e para os erros dele mesmo (PGRSTnnn).
const doBanco = (code: string | null, message: string | null, details: string | null = null): ErroDoBanco => ({
  code,
  message,
  details,
  hint: null,
});

describe("reasonDoBanco", () => {
  it("é o message da regra, com o detail depois de dois-pontos", () => {
    expect(reasonDoBanco(doBanco("23505", "ATTA-IN-0002", "cpf"))).toBe("ATTA-IN-0002:cpf");
    expect(reasonDoBanco(doBanco("42501", "ATTA-AUTH-0004"))).toBe("ATTA-AUTH-0004");
    expect(reasonDoBanco(doBanco("P0002", "ATTA-CORE-0005", "person_id"))).toBe("ATTA-CORE-0005:person_id");
  });

  it("não existe quando o banco não levantou uma regra nossa", () => {
    expect(reasonDoBanco(doBanco("23505", 'duplicate key value violates unique constraint "person_cpf_hmac_key"'))).toBe(
      undefined,
    );
    expect(reasonDoBanco(doBanco("PGRST202", "Could not find the function api.agenda_day"))).toBe(undefined);
    expect(reasonDoBanco({})).toBe(undefined);
  });

  it("o detail que não é identificador fica de fora: nunca ecoa valor", () => {
    expect(reasonDoBanco(doBanco("23505", "ATTA-IN-0002", "Key (cpf_hmac)=(\\x9f2a) already exists."))).toBe(
      "ATTA-IN-0002",
    );
    expect(reasonDoBanco(doBanco("P0001", "ATTA-IN-0001", "Maria Souza"))).toBe("ATTA-IN-0001");
  });
});

describe("lerReason", () => {
  it("separa a regra e o detalhe", () => {
    expect(lerReason("ATTA-IN-0002:cpf")).toEqual({ regra: "ATTA-IN-0002", detalhe: "cpf" });
    expect(lerReason("ATTA-AUTH-0004")).toEqual({ regra: "ATTA-AUTH-0004" });
  });
});

describe("falhaDoBanco", () => {
  const casos: Array<[string, ErroDoBanco, CodigoDeErro, string | undefined]> = [
    ["valor recusado (ATTA-IN-0001)", doBanco("P0001", "ATTA-IN-0001", "birth_date"), "VALIDACAO", "ATTA-IN-0001:birth_date"],
    ["regra de estado (P0001 que não é -0001)", doBanco("P0001", "ATTA-IN-0003", "status"), "CONFLITO", "ATTA-IN-0003:status"],
    ["já cadastrado (23505)", doBanco("23505", "ATTA-IN-0002", "cpf"), "CONFLITO", "ATTA-IN-0002:cpf"],
    ["exclusão violada (23P01)", doBanco("23P01", "conflicting key value violates exclusion constraint"), "CONFLITO", undefined],
    ["sem permissão (42501)", doBanco("42501", "ATTA-AUTH-0004"), "SEM_PERMISSAO", "ATTA-AUTH-0004"],
    ["não encontrado (P0002)", doBanco("P0002", "ATTA-CORE-0005", "person_id"), "NAO_ENCONTRADO", "ATTA-CORE-0005:person_id"],
    ["nenhuma linha no single (PGRST116)", doBanco("PGRST116", "JSON object requested, multiple (or no) rows returned"), "NAO_ENCONTRADO", undefined],
    ["JWT vencido (PGRST301)", doBanco("PGRST301", "JWT expired"), "NAO_AUTENTICADO", undefined],
    ["check violado (23514)", doBanco("23514", 'new row violates check constraint "appointment_check"'), "VALIDACAO", undefined],
    ["texto inválido (22P02)", doBanco("22P02", "invalid input syntax for type uuid"), "VALIDACAO", undefined],
    ["banco fora (PGRST001)", doBanco("PGRST001", "Database client error"), "INDISPONIVEL", undefined],
    ["consulta cancelada (57014)", doBanco("57014", "canceling statement due to statement timeout"), "INDISPONIVEL", undefined],
    ["função inexistente (PGRST202)", doBanco("PGRST202", "Could not find the function"), "INTERNO", undefined],
    ["falha do fetch, sem code", doBanco("", "TypeError: fetch failed"), "INDISPONIVEL", undefined],
  ];

  it.each(casos)("%s", (_, erro, code, reason) => {
    const r = falhaDoBanco(erro);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(code);
    expect(r.error.reason).toBe(reason);
    expect(r.error.message).toBe(MENSAGENS[code]);
  });

  it("validação com detail aponta o campo; sem detail, não inventa campo", () => {
    const comCampo = falhaDoBanco(doBanco("P0001", "ATTA-IN-0001", "full_name"));
    expect(comCampo.ok ? null : comCampo.error.fields).toEqual([{ campo: "full_name", code: "VALIDACAO" }]);
    const semCampo = falhaDoBanco(doBanco("22P02", "invalid input syntax for type uuid"));
    expect(semCampo.ok ? null : semCampo.error.fields).toBe(undefined);
  });

  it("nunca devolve a mensagem nem o detalhe crus do banco", () => {
    const nativo = doBanco("23505", "duplicate key value", "Key (cpf_hmac)=(\\x9f2a) already exists.");
    const texto = JSON.stringify(falhaDoBanco(nativo));
    expect(texto).not.toContain("cpf_hmac");
    expect(texto).not.toContain("duplicate key");
  });
});
