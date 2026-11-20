// Conformidade do ATTA Sign v1 com os vetores congelados do atta-core (porte de test_atta_sign_v1.py).
// payload → JCS → SHA-256 → Código ATTA, byte a byte. Os arquivos de tests/vectors/** não mudam (ver manifesto).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attaCode, evidenceSha256, normalizeAttaCode } from "../../src/lib/atta-sign/attasign";
import { canonicalize } from "../../src/lib/atta-sign/jcs";

const V1 = join(__dirname, "../vectors/atta_sign_v1");
const CASOS = readdirSync(V1, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const ler = (caso: string, arquivo: string) => readFileSync(join(V1, caso, arquivo));

describe("atta_sign_version 1", () => {
  it("os três casos do 06 §6.3 existem completos", () => {
    expect(CASOS).toEqual(
      expect.arrayContaining([
        "caso-01-tcle-minimo",
        "caso-02-tres-partes-rt-e-profissional",
        "caso-03-com-assistencia-e-acentuacao-nfc",
      ]),
    );
    for (const caso of CASOS) {
      expect(readdirSync(join(V1, caso)).sort()).toEqual([
        "atta_code.txt",
        "canonical.txt",
        "evidence_sha256.txt",
        "payload.json",
      ]);
    }
  });

  it.each(CASOS)("%s: JCS, SHA-256 e Código ATTA batem byte a byte", (caso) => {
    const texto = ler(caso, "payload.json").toString("utf8");
    expect(texto.normalize("NFC")).toBe(texto); // o JCS não normaliza Unicode
    const payload = JSON.parse(texto);
    expect(payload.atta_sign_version).toBe("1");
    const canonico = ler(caso, "canonical.txt");
    const evidencia = ler(caso, "evidence_sha256.txt").toString("ascii").trim();
    const codigo = ler(caso, "atta_code.txt").toString("ascii").trim();

    expect(Buffer.from(canonicalize(payload)).equals(canonico)).toBe(true);
    expect(createHash("sha256").update(canonico).digest("hex")).toBe(evidencia);
    expect(evidenceSha256(payload)).toBe(evidencia);
    expect(attaCode(evidencia)).toBe(codigo);
    expect(normalizeAttaCode(codigo)).toBe(codigo);
  });

  it.each(CASOS)("%s: o canônico reparseia no mesmo payload", (caso) => {
    const payload = JSON.parse(ler(caso, "payload.json").toString("utf8"));
    expect(JSON.parse(ler(caso, "canonical.txt").toString("utf8"))).toEqual(payload);
  });

  it("caso 3 prende a acentuação NFC: NFD é outro hash", () => {
    const payload = JSON.parse(ler("caso-03-com-assistencia-e-acentuacao-nfc", "payload.json").toString("utf8"));
    const nomes: string[] = payload.parties.map((p: { name: string }) => p.name);
    expect(nomes.some((n) => n.normalize("NFD") !== n)).toBe(true);
    const emNfd = JSON.parse(JSON.stringify(payload).normalize("NFD"));
    expect(evidenceSha256(emNfd)).not.toBe(evidenceSha256(payload));
  });
});

describe("regras da versão 1 fora dos vetores", () => {
  const base = JSON.parse(ler("caso-01-tcle-minimo", "payload.json").toString("utf8"));

  it("recusa extensions.icp_brasil em vez de remover", () => {
    expect(() => evidenceSha256({ ...base, extensions: { icp_brasil: {} } })).toThrow(/icp_brasil/);
  });

  it("recusa versão ausente ou desconhecida", () => {
    expect(() => evidenceSha256({ ...base, atta_sign_version: 1 })).toThrow();
    expect(() => evidenceSha256({ ...base, atta_sign_version: "2" })).toThrow();
    expect(() => evidenceSha256({ ...base, atta_sign_version: "constructor" })).toThrow();
  });

  it("recusa número fracionário ou inteiro fora de ±2^53", () => {
    expect(() => evidenceSha256({ ...base, extensions: { code_nonce: 1.5 } })).toThrow();
    expect(() => evidenceSha256({ ...base, extensions: { code_nonce: 2 ** 53 + 2 } })).toThrow();
  });

  it("code_nonce entra no hash e muda o código", () => {
    const a = evidenceSha256(base);
    const b = evidenceSha256({ ...base, extensions: { ...(base.extensions ?? {}), code_nonce: 1 } });
    expect(attaCode(a)).not.toBe(attaCode(b));
  });
});

describe("normalizeAttaCode (RFC-0020 D-2)", () => {
  const codigo = ler("caso-02-tres-partes-rt-e-profissional", "atta_code.txt").toString("ascii").trim();

  it("aceita minúscula, sem prefixo, espaços, hífens e O/I/L", () => {
    expect(normalizeAttaCode(codigo.toLowerCase())).toBe(codigo);
    expect(normalizeAttaCode(codigo.slice(5).replaceAll("-", " "))).toBe(codigo);
    expect(normalizeAttaCode(codigo.replace(/0/g, "O"))).toBe(codigo);
  });

  it("malformado tem mensagem única, sem eco", () => {
    for (const ruim of ["", "ATTA-XXXX", "ATTA-UUUU-UUUU-UUUU", "ÁTTA-9JH5-74T0-AXDT", "x".repeat(65)]) {
      expect(() => normalizeAttaCode(ruim)).toThrow(/^Código ATTA malformado$/);
    }
  });
});
