// JCS contra os vetores do próprio RFC 8785 (porte de test_jcs_vectors.py).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize, canonicalizeToString } from "../../src/lib/atta-sign/jcs";

const RFC = join(__dirname, "../vectors/rfc8785");
const CASOS = readdirSync(join(RFC, "input")).map((f) => f.replace(/\.json$/, "")).sort();

function linhasDeNumero(arquivo: string): [string, string | undefined][] {
  return readFileSync(join(RFC, arquivo), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [hex = "", esperado] = l.split(",");
      return [hex, esperado || undefined];
    });
}

function doubleDeHex(hex: string): number {
  const b = Buffer.from(hex.padStart(16, "0"), "hex"); // o es6testfile omite zeros à esquerda
  return b.readDoubleBE(0);
}

describe("RFC 8785", () => {
  it("os seis vetores da referência estão presentes", () => {
    expect(CASOS).toEqual(["arrays", "french", "structures", "unicode", "values", "weird"]);
  });

  it.each(CASOS)("%s: input canonicalizado é output e outhex", (caso) => {
    const entrada = JSON.parse(readFileSync(join(RFC, "input", `${caso}.json`), "utf8"));
    const saida = Buffer.from(canonicalize(entrada));
    expect(saida.equals(readFileSync(join(RFC, "output", `${caso}.json`)))).toBe(true);
    const hex = readFileSync(join(RFC, "outhex", `${caso}.txt`), "utf8").replace(/\s+/g, "").toLowerCase();
    expect(saida.toString("hex")).toBe(hex);
  });

  it.each([...linhasDeNumero("apendice-b-numeros.txt"), ...linhasDeNumero("es6testfile-amostra.txt")])(
    "número %s → %s",
    (hex, esperado) => {
      const n = doubleDeHex(hex);
      if (esperado === undefined) expect(() => canonicalizeToString(n)).toThrow();
      else expect(canonicalizeToString(n)).toBe(esperado);
    },
  );

  it("ordena por unidade de código UTF-16 (§3.2.3)", () => {
    // U+1F600 (surrogate D83D) vem antes de U+FB33 em UTF-16, depois em code point
    const obj = { "\u{1F600}": 1, "\uFB33": 2, a: 3, "\u20AC": 4 };
    expect(canonicalizeToString(obj)).toBe('{"a":3,"\u20AC":4,"\u{1F600}":1,"\uFB33":2}');
  });

  it("falha fechada: surrogate solto, undefined, NaN", () => {
    expect(() => canonicalizeToString("\uD800")).toThrow();
    expect(() => canonicalizeToString({ ["\uDC00"]: 1 })).toThrow();
    expect(() => canonicalizeToString({ a: undefined })).toThrow();
    expect(() => canonicalizeToString(Number.NaN)).toThrow();
    expect(() => canonicalizeToString(new Date(0))).toThrow();
  });
});
