// Download dos PDFs no fim do PROpass (PDD v206 §10.4.3; ADR 0001; decisão do CTO, 21/11). Só dado fictício.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalize } from "@/lib/atta-sign/jcs";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { columnAad, seal } from "@/server/crypto/envelope";
import { CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { baixarDocumentoDoPropass, cabecalhosDoPdf, type ClienteDoDownload } from "./download";
import * as pdf from "./pdf";

const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING, new Set(), "ATTA_REDE_CHAVE_MESTRA"));
const SEGREDO = Buffer.alloc(32, 7).toString("base64url");
const HASH = createHash("sha256").update(Buffer.from(SEGREDO, "base64url")).digest("hex");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

const BODY = "Termo de Autorização de Uso de Imagem de Assinatura Digital\n\nEu, {{profissional.nome}}, inscrita(o) no " +
  "{{profissional.registro}}, autorizo {{clinica.razao_social}} (CNPJ {{clinica.cnpj}}), \"{{clinica.nome}}\" → fim.";
const payload = {
  atta_sign_version: "1",
  tenant: { legal_name: "Clínica Fictícia Ltda", trade_name: "Clínica Fictícia", cnpj: "00.000.000/0001-91" },
  parties: [{ ref: "p1", role: "professional", name: "Dra. Fictícia", council: "CRO-SP 11111" }],
  signature: { signer: "p1", level: "atta_sign", signed_at: "2026-11-21T10:02:03.456Z" },
};
const bytes = Buffer.from(canonicalize(payload));
const conteudoDoTermo = (extra: Partial<Record<string, string>> = {}) => ({
  payload_canonical_b64: bytes.toString("base64"),
  atta_code: "ATTA-JQ8D-911A-H7XW",
  evidence_sha256: sha(bytes),
  body: BODY,
  body_sha256: sha(BODY),
  ...extra,
});

function cliente(resposta: { data?: unknown; error?: { code: string; message: string } | null }) {
  const chamadas: unknown[] = [];
  const c: ClienteDoDownload = {
    schema: () => ({
      rpc: (_fn, args) => {
        chamadas.push(args);
        return Promise.resolve({ data: resposta.data ?? null, error: resposta.error ?? null });
      },
    }),
  };
  return { c, chamadas };
}

describe("baixarDocumentoDoPropass", () => {
  it("termo: PDF da versão selada, com o texto preenchido pelos valores do payload e o nome com o Código ATTA", async () => {
    const espiao = vi.spyOn(pdf, "gerarPdfDoTermo");
    const { c, chamadas } = cliente({ data: [{ kind: "termo", content: conteudoDoTermo() }] });
    const r = await baixarDocumentoDoPropass(SEGREDO, "termo", { cliente: c, cofre });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nomeArquivo).toBe("termo-de-autorizacao-ATTA-JQ8D-911A-H7XW.pdf");
    expect(Buffer.from(r.data.conteudo.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(chamadas).toEqual([{ p_download_hash: `\\x${HASH}`, p_kind: "termo" }]);
    const args = espiao.mock.calls[0]![0];
    expect(args.texto).toContain("Eu, Dra. Fictícia, inscrita(o) no CRO-SP 11111, autorizo Clínica Fictícia Ltda (CNPJ 00.000.000/0001-91)");
    expect(args.texto).not.toMatch(/\{\{|\}\}/);
    expect(args).toMatchObject({ codigoAtta: "ATTA-JQ8D-911A-H7XW", evidenceSha256: sha(bytes), assinadoEm: "2026-11-21T10:02:03.456Z" });
    espiao.mockRestore();
  });

  it("o PDF é determinístico: o mesmo registro gera os mesmos bytes", async () => {
    const a = await baixarDocumentoDoPropass(SEGREDO, "termo", { cliente: cliente({ data: [{ kind: "termo", content: conteudoDoTermo() }] }).c, cofre });
    const b = await baixarDocumentoDoPropass(SEGREDO, "termo", { cliente: cliente({ data: [{ kind: "termo", content: conteudoDoTermo() }] }).c, cofre });
    expect(a.ok && b.ok && Buffer.compare(Buffer.from(a.data.conteudo), Buffer.from(b.data.conteudo))).toBe(0);
  });

  it("registro adulterado ou texto fora da versão: erro interno, sem PDF", async () => {
    for (const extra of [{ evidence_sha256: "b".repeat(64) }, { body_sha256: "c".repeat(64) }]) {
      const r = await baixarDocumentoDoPropass(SEGREDO, "termo", { cliente: cliente({ data: [{ kind: "termo", content: conteudoDoTermo(extra) }] }).c, cofre });
      expect(r.ok ? "ok" : r.error.code).toBe("INTERNO");
    }
  });

  it("dados: CPF e WhatsApp completos (decisão do CTO), decifrados no servidor, sem guardar nada", async () => {
    const id = "00000000-0000-4000-8000-0000000005f1";
    const ctx = { tenant_id: "", table: "platform.professional", column: "dek", id };
    const { plaintext: dek, wrapped } = await cofre.generateDataKey(ctx);
    const cif = (v: string, col: string) => seal(Buffer.from(v, "utf8"), dek, columnAad("", "platform.professional", col, id)).toString("hex");
    const content = {
      professional_id: id, nome: "Dra. Fictícia", conselho: "cro", uf: "SP", numero: "11111",
      cpf_enc: cif("52998224725", "cpf_enc"), phone_enc: cif("11912345678", "phone_enc"), email_enc: cif("dra@exemplo.test", "email_enc"),
      dek_wrapped: Buffer.from(wrapped.blob).toString("hex"), kek_version: wrapped.kekVersion,
      clinica_nome: "Clínica Fictícia", clinica_razao_social: "Clínica Fictícia Ltda", enviado_em: "2026-11-21T10:05:00.000Z",
    };
    dek.fill(0);
    const espiao = vi.spyOn(pdf, "gerarPdfDosDados");
    const r = await baixarDocumentoDoPropass(SEGREDO, "dados", { cliente: cliente({ data: [{ kind: "dados", content }] }).c, cofre });
    expect(r.ok && r.data.nomeArquivo).toBe("meus-dados-propass.pdf");
    expect(espiao.mock.calls[0]![0].campos).toEqual([
      ["Nome completo", "Dra. Fictícia"],
      ["E-mail profissional", "dra@exemplo.test"],
      ["CPF", "529.982.247-25"],
      ["Conselho", "CRO-SP 11111"],
      ["WhatsApp", "(11) 91234-5678"],
    ]);
    espiao.mockRestore();
  });

  it("sem grant, vencido ou acima do teto: a mesma resposta (NAO_AUTENTICADO), sem oráculo", async () => {
    const vencido = await baixarDocumentoDoPropass(SEGREDO, "termo", { cliente: cliente({ error: { code: "42501", message: "ATTA-AUTH-0004" } }).c, cofre });
    const semSegredo = await baixarDocumentoDoPropass("curto", "termo", { cliente: cliente({}).c, cofre });
    const tipoRuim = await baixarDocumentoDoPropass(SEGREDO, "outro" as "termo", { cliente: cliente({}).c, cofre });
    for (const r of [vencido, semSegredo, tipoRuim]) expect(r.ok ? "ok" : r.error.code).toBe("NAO_AUTENTICADO");
  });

  it("cabeçalhos: anexo, sem cache e sem adivinhar o tipo", () => {
    expect(cabecalhosDoPdf("meus-dados-propass.pdf")).toEqual({
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="meus-dados-propass.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
  });
});
