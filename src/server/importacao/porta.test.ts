import { describe, expect, it } from "vitest";
import { PUT } from "@/app/api/importacao/simulado/route";
import { escolherPortaImportacao } from "./porta";
import { FORA_DO_MODELO, portaImportacaoSimulada } from "./simulado";
import { portaImportacaoVazia } from "./vazia";

describe("escolha da porta", () => {
  it("vazia na produção, simulada no resto", () => {
    expect(escolherPortaImportacao("production")).toBe(portaImportacaoVazia);
    expect(escolherPortaImportacao("preview")).toBe(portaImportacaoSimulada);
    expect(escolherPortaImportacao(undefined)).toBe(portaImportacaoSimulada);
  });
});

describe("porta vazia", () => {
  it("tudo INDISPONIVEL, nada inventado", async () => {
    for (const r of [
      await portaImportacaoVazia.situacao(),
      await portaImportacaoVazia.previa("x"),
      await portaImportacaoVazia.confirmar("x"),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { code: "INDISPONIVEL" } });
    }
  });
});

describe("porta simulada", () => {
  it("fluxo completo: declaração, envio, prévia, confirmação e resultado", async () => {
    const s = portaImportacaoSimulada;
    const sit = await s.situacao();
    expect(sit.ok && sit.data.included).toEqual({ used: 0, total: 2 });
    expect(sit.ok && sit.data.price_per_import_cents).toBe(3990);
    const decl = await s.declarar("2026-11");
    if (!decl.ok) throw new Error();
    const envio = await s.iniciarEnvio(decl.data.declaration_id, 50_000);
    if (!envio.ok) throw new Error();
    const previa = await s.previa(envio.data.import_id);
    expect(previa.ok && previa.data).toMatchObject({ total: 6, valid: 3 });
    expect(previa.ok && previa.data.errors.map((e) => e.code)).toEqual([
      "nome_ausente",
      "cpf_invalido",
      "cpf_repetido_na_planilha",
    ]);
    expect(previa.ok && previa.data.blanked).toEqual([
      { line: 3, field: "celular" },
      { line: 6, field: "email" },
    ]);
    const conf = await s.confirmar(envio.data.import_id);
    expect(conf.ok && conf.data.status).toBe("processando");
    const res = await s.resultado(envio.data.import_id);
    expect(res.ok && res.data).toMatchObject({ imported: 2, linked_to_network: 1, already_in_clinic: 0, blanked: 2 });
  });

  it("sem declaração, arquivo grande demais ou fora do modelo", async () => {
    const s = portaImportacaoSimulada;
    expect(await s.iniciarEnvio("qualquer", 50_000)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
    const decl = await s.declarar("2026-11");
    if (!decl.ok) throw new Error();
    expect(await s.iniciarEnvio(decl.data.declaration_id, 21 * 1024 * 1024)).toMatchObject({
      ok: false,
      error: { code: "LIMITE" },
    });
    const pequeno = await s.iniciarEnvio(decl.data.declaration_id, 100);
    if (!pequeno.ok) throw new Error();
    expect(await s.previa(pequeno.data.import_id)).toMatchObject({
      ok: false,
      error: { code: "VALIDACAO", message: FORA_DO_MODELO, fields: [{ campo: "arquivo" }] },
    });
  });
});

describe("rota simulada do envio", () => {
  it("aceita o PUT fora da produção e some na produção", async () => {
    expect((await PUT()).status).toBe(204);
    const antes = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "production";
    expect((await PUT()).status).toBe(404);
    process.env.VERCEL_ENV = antes;
  });
});
