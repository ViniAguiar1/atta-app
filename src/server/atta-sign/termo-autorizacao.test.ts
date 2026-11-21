// MIG-21c (parte 2): o pacote do Termo de Autorização (PDD v206 §10.4.3; ADR 0001 §1, 0002, 0006, 0014). Só dado fictício.
import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { attaCode, evidenceSha256 } from "@/lib/atta-sign/attasign";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { columnAad, open } from "@/server/crypto/envelope";
import { CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { verifySeal } from "./seal";
import { assinarTermoDeAutorizacao, registroDoConselho, TETO_DO_PNG, type DadosDoTermo } from "./termo-autorizacao";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const CHAVE = { kid: "staging-seal-teste-unidade", privadaPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
const PUBLICA = publicKey.export({ type: "spki", format: "der" }).toString("base64");
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING, new Set(), "ATTA_DOCUMENTOS_CHAVE_MESTRA"));
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
const TENANT = "00000000-0000-4000-8000-0000000005a1";
const DOC = "00000000-0000-4000-8000-0000000005c1";

const dados = (png: Uint8Array = PNG): DadosDoTermo => ({
  tenantId: TENANT,
  vinculoId: "00000000-0000-4000-8000-0000000005d1",
  clinica: { razaoSocial: "Clínica Fictícia Ltda", nomeFantasia: "Clínica Fictícia", cnpj: "00.000.000/0001-91" },
  profissional: { nome: "Dra. Fictícia", conselho: "cro", uf: "SP", numero: "11111" },
  modelo: { id: "00000000-0000-4000-8000-0000000005e1", versao: 1, bodySha256: "a".repeat(64), bodyNormalization: "nfc+lf+trim" },
  assinatura: {
    png,
    abertoEm: new Date("2026-11-21T10:00:00.000Z"),
    rolagemCompletaEm: new Date("2026-11-21T10:01:00.000Z"),
    ip: "203.0.113.7",
    userAgent: "Navegador Fictício",
  },
});

async function montar(png?: Uint8Array) {
  const subidos: { caminho: string; conteudo: Uint8Array }[] = [];
  const pacote = await assinarTermoDeAutorizacao(dados(png), {
    cofre,
    chave: CHAVE,
    agora: () => new Date("2026-11-21T10:02:03.456Z"),
    novoId: () => DOC,
    subir: async (caminho, conteudo) => void subidos.push({ caminho, conteudo }),
  });
  const payload = JSON.parse(Buffer.from(pacote.p_payload_canonical.slice(2), "hex").toString("utf8"));
  return { pacote, payload, subidos };
}

describe("assinarTermoDeAutorizacao", () => {
  it("monta o payload que o banco confere: documento, modelo, vínculo, signatário e traço", async () => {
    const { pacote, payload } = await montar();
    expect(pacote.p_document_id).toBe(DOC);
    expect(payload.document).toEqual({ id: DOC, type: "termo_de_autorizacao", template_id: "00000000-0000-4000-8000-0000000005e1",
      template_version: 1, body_sha256: "a".repeat(64), body_normalization: "nfc+lf+trim" });
    expect(payload.context).toMatchObject({ product: "atta_in", context_type: "professional_authorization",
      context_id: "00000000-0000-4000-8000-0000000005d1" });
    expect(payload.parties).toEqual([expect.objectContaining({ ref: "p1", role: "professional", council: "CRO-SP 11111" })]);
    expect(payload.signature).toMatchObject({ signer: "p1", level: "atta_sign", signed_at: "2026-11-21T10:02:03.456Z",
      stroke_sha256: createHash("sha256").update(PNG).digest("hex") });
    expect(payload.signature.exposure).toMatchObject({ scroll_complete: true, exposure_ms: 123456 });
  });

  it("o Código ATTA e o selo saem do hash dos bytes canônicos, e o selo confere pelo manifesto público", async () => {
    const { pacote, payload } = await montar();
    const bytes = Buffer.from(pacote.p_payload_canonical.slice(2), "hex");
    const evidencia = createHash("sha256").update(bytes).digest("hex");
    expect(evidenceSha256(payload)).toBe(evidencia); // o que foi enviado é exatamente o JCS do payload
    expect(pacote.p_atta_code).toBe(attaCode(evidencia));
    const selo = { kid: CHAVE.kid, alg: "Ed25519" as const, sig_b64: Buffer.from(pacote.p_seal.slice(2), "hex").toString("base64") };
    const manifesto = [{ kid: CHAVE.kid, alg: "Ed25519" as const, public_key_spki_b64: PUBLICA, valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }];
    expect(verifySeal(evidencia, selo, manifesto, payload.signature.signed_at)).toBe(true);
  });

  it("o PNG sobe cifrado no caminho da clínica e do documento, e só abre com a DEK e a AAD certas", async () => {
    const { pacote, subidos } = await montar();
    expect(subidos).toHaveLength(1);
    expect(subidos[0]!.caminho).toBe(`${TENANT}/${DOC}/assinatura.png`);
    expect(pacote.p_stroke.storage_path).toBe(subidos[0]!.caminho);
    expect(Buffer.from(subidos[0]!.conteudo).includes(Buffer.from(PNG))).toBe(false);
    const ctx = { tenant_id: TENANT, table: "documents.stored_object", column: "signature_stroke", id: DOC };
    const dek = await cofre.unwrapDataKey({ kekVersion: pacote.p_stroke.kek_version, blob: Buffer.from(pacote.p_stroke.dek_wrapped, "hex") }, ctx);
    expect(Buffer.compare(open(subidos[0]!.conteudo, dek, columnAad(TENANT, ctx.table, ctx.column, DOC)), Buffer.from(PNG))).toBe(0);
    expect(() => open(subidos[0]!.conteudo, dek, columnAad(TENANT, ctx.table, ctx.column, "00000000-0000-4000-8000-000000000000"))).toThrow();
    expect(pacote.p_stroke).toMatchObject({ size_bytes: PNG.length, sha256_plain: createHash("sha256").update(PNG).digest("hex") });
  });

  it("a chave privada nunca sai no pacote", async () => {
    const { pacote } = await montar();
    const texto = JSON.stringify(pacote);
    expect(texto).not.toContain("PRIVATE KEY");
    expect(texto).not.toContain(CHAVE.privadaPem.split("\n")[1]!);
  });

  it("recusa o que não é PNG, o PNG acima do teto e a leitura até o fim antes da abertura, sem subir nada", async () => {
    const subidos: string[] = [];
    const deps = { cofre, chave: CHAVE, subir: async (c: string) => void subidos.push(c) };
    await expect(assinarTermoDeAutorizacao(dados(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9])), deps)).rejects.toThrow(/PNG/);
    const grande = new Uint8Array(TETO_DO_PNG + 1);
    grande.set(PNG.subarray(0, 8));
    await expect(assinarTermoDeAutorizacao(dados(grande), deps)).rejects.toThrow(/PNG/);
    const invertido = { ...dados(), assinatura: { ...dados().assinatura, rolagemCompletaEm: new Date("2026-11-21T09:00:00.000Z") } };
    await expect(assinarTermoDeAutorizacao(invertido, deps)).rejects.toThrow(/leitura/);
    expect(subidos).toEqual([]);
  });

  it("selo com chave que não é Ed25519 não vira pacote", async () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    await expect(assinarTermoDeAutorizacao(dados(), { cofre, chave: { kid: CHAVE.kid, privadaPem: rsa }, subir: async () => {} }))
      .rejects.toThrow();
  });

  it("registroDoConselho segue a forma do payload (o banco recalcula igual)", () => {
    expect(registroDoConselho("crm", "sp", "201.577")).toBe("CRM-SP 201.577");
  });
});
