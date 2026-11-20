// CPF e RNE/RNM (ADR 0002 §6) e selo Ed25519 do ATTA Sign (ADR 0006 §7, ADR 0014). O HMAC de CPF bate byte a byte com
// crypto_v1/hmac_cpf.json do atta-core. Só dados sintéticos.
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { signEvidence, verifySeal } from "../../src/server/atta-sign/seal";
import { createHmac } from "node:crypto";
import { emailHmac, emailHmacWith, normalizeEmail } from "../../src/server/crypto/email";
import { cpfHmac, cpfHmacWith, isForeignDocKind, isValidCpf, isValidRne, maskCpf, maskRne, normalizeCpf, normalizeRne, rneHmac, rneHmacWith } from "../../src/server/crypto/cpf";

const vector = (name: string) => JSON.parse(readFileSync(join(__dirname, "../vectors/crypto_v1", `${name}.json`), "utf8"));
const hex = (s: string) => Buffer.from(s, "hex");

describe("crypto_v1/hmac_cpf.json (byte a byte)", () => {
  it("HMAC de CPF", () => {
    const v = vector("hmac_cpf");
    expect(v.casos).toHaveLength(3);
    for (const c of v.casos) expect(cpfHmacWith(hex(v.pepper_hex), c.cpf).toString("hex")).toBe(c.hmac_hex);
    process.env.ATTA_CPF_PEPPER = v.pepper_hex; // cpfHmac lê o pepper da variável
    for (const c of v.casos) expect(cpfHmac(c.cpf).toString("hex")).toBe(c.hmac_hex);
  });

});

describe("CPF e RNE (ADR 0002 §6; dados sintéticos)", () => {
  it("normalizeCpf: máscara e espaço saem; o resto é null", () => {
    expect(normalizeCpf(" 529.982.247-25 ")).toBe("52998224725");
    for (const bad of ["", "5299822472", "529982247250", "529.982.247-2a", "５２９９８２２４７２５", "52998224725\u0000"]) {
      expect(normalizeCpf(bad)).toBeNull();
    }
  });

  it("isValidCpf: dígito verificador e sequência repetida (CPFs gerados, não reais)", () => {
    expect(isValidCpf("52998224725")).toBe(true); // exemplo público de CPF gerado
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("12345678901")).toBe(false); // os do vetor têm DV inválido de propósito
  });

  it("maskCpf com o ponto médio do simulador (U+00B7), só os 5 últimos dígitos", () => {
    expect(maskCpf("52998224725")).toBe("\u00b7\u00b7\u00b7.\u00b7\u00b7\u00b7.247-25"); // ···.···.247-25, o exemplo do Tech Lead
    expect(maskCpf("98765432100")).toBe("···.···.321-00");
    expect(maskCpf("98765432100")).not.toContain("*");
    expect(() => maskCpf("987.654.321-00")).toThrow();
  });

  it("RNE e RNM/CRNM (regra do dono): letras e dígitos, sem DV; HMAC e máscara", () => {
    expect(normalizeRne("v123456-7")).toBe("V1234567");
    expect(normalizeRne("V 123.456/7")).toBe("V1234567");
    expect(normalizeRne("Ñ123456")).toBeNull();
    expect(isValidRne("V1234567")).toBe(true);
    expect(isValidRne("1234567")).toBe(true); // sem DV e sem exigir letra
    expect(normalizeRne("f123456-x")).toBe("F123456X"); // forma de RNM/CRNM fictícia
    expect(isValidRne("1234")).toBe(false);
    expect(isForeignDocKind("rne") && isForeignDocKind("rnm")).toBe(true);
    expect(isForeignDocKind("passaporte")).toBe(false);
    expect(maskRne("V1234567")).toBe("·····567");
    const pepper = Buffer.alloc(32, 7);
    expect(rneHmacWith(pepper, "V1234567").equals(rneHmacWith(pepper, normalizeRne("v123456-7")!))).toBe(true);
    // o RNE usa o pepper dele, nunca o do CPF
    process.env.ATTA_CPF_PEPPER = "aa".repeat(32);
    delete process.env.ATTA_RNE_PEPPER;
    expect(() => rneHmac("V1234567")).toThrow(/ATTA_RNE_PEPPER/);
    process.env.ATTA_RNE_PEPPER = "07".repeat(32);
    expect(rneHmac("V1234567").equals(rneHmacWith(pepper, "V1234567"))).toBe(true);
  });
});

describe("e-mail para busca (ADR 0002 §6)", () => {
  const pepper = hex("7065707065722d73696e74657469636f2d64652d74657374652d6174696e3532"); // o do vetor, sintético

  it("normalizeEmail: trim e minúsculas; forma inválida vira null", () => {
    expect(normalizeEmail("  Fulano.Ficticio@Exemplo.TEST ")).toBe("fulano.ficticio@exemplo.test");
    for (const bad of ["", "sem-arroba", "a@b", "a b@exemplo.test", "a@@exemplo.test", "a@exemplo..test", `${"x".repeat(250)}@e.test`]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it("emailHmac = HMAC-SHA256(ATTA_CPF_PEPPER, 'atta.email.v1|' + e-mail) e é igual para grafias da mesma caixa", () => {
    const esperado = createHmac("sha256", pepper).update("atta.email.v1|fulano@exemplo.test").digest();
    expect(emailHmacWith(pepper, "fulano@exemplo.test").equals(esperado)).toBe(true);
    process.env.ATTA_CPF_PEPPER = pepper.toString("hex");
    expect(emailHmac(normalizeEmail(" FULANO@exemplo.test")!).equals(esperado)).toBe(true);
    expect(() => emailHmacWith(pepper, "Fulano@exemplo.test")).toThrow(); // exige a forma normalizada
  });

  it("emailHmac e cpfHmac não colidem: o rótulo separa os domínios", () => {
    const cpf = "12345678901";
    const email = `${cpf}@exemplo.test`;
    expect(emailHmacWith(pepper, email).equals(cpfHmacWith(pepper, cpf))).toBe(false);
    // sem o rótulo seria só HMAC(pepper, e-mail); com ele, nunca é a mesma entrada de um CPF (11 dígitos sem rótulo)
    const semRotulo = createHmac("sha256", pepper).update(email).digest();
    expect(emailHmacWith(pepper, email).equals(semRotulo)).toBe(false);
  });
});

describe("selo Ed25519 (sem vetor no atta-core: ida e volta e manifesto)", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const manifest = [
    {
      kid: "staging-seal-2026-11",
      alg: "Ed25519" as const,
      public_key_spki_b64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      valid_from: "2026-11-20T00:00:00.000Z",
      valid_until: null,
    },
  ];
  const evidence = readFileSync(join(__dirname, "../vectors/atta_sign_v1/caso-01-tcle-minimo/evidence_sha256.txt"), "ascii").trim();

  const assinadoEm = "2026-11-20T14:00:00.000Z";

  it("verifica pelo manifesto e falha com hash, kid ou assinatura trocados", () => {
    const s = signEvidence(evidence, "staging-seal-2026-11", pem);
    expect(verifySeal(evidence, s, manifest, assinadoEm)).toBe(true);
    expect(verifySeal(evidence.slice(0, -1) + (evidence.endsWith("0") ? "1" : "0"), s, manifest, assinadoEm)).toBe(false);
    expect(verifySeal(evidence, { ...s, kid: "outro" }, manifest, assinadoEm)).toBe(false);
    const sig = Buffer.from(s.sig_b64, "base64");
    sig[0]! ^= 1;
    expect(verifySeal(evidence, { ...s, sig_b64: sig.toString("base64") }, manifest, assinadoEm)).toBe(false);
  });

  it("confere a janela de validade do kid contra o signed_at (MIG-24)", () => {
    const s = signEvidence(evidence, "staging-seal-2026-11", pem);
    const aposentada = [{ ...manifest[0]!, valid_until: "2026-11-21T00:00:00.000Z" }];
    expect(verifySeal(evidence, s, manifest, "2026-11-20T00:00:00.000Z")).toBe(true); // início inclusivo
    expect(verifySeal(evidence, s, manifest, "2026-11-19T23:59:59.999Z")).toBe(false); // antes da chave existir
    expect(verifySeal(evidence, s, aposentada, "2026-11-20T23:59:59.999Z")).toBe(true);
    expect(verifySeal(evidence, s, aposentada, "2026-11-21T00:00:00.000Z")).toBe(false); // fim exclusivo
    expect(verifySeal(evidence, s, aposentada, "2027-01-01T00:00:00.000Z")).toBe(false); // depois da aposentadoria
  });

  it("entrada malformada devolve false, sem lançar (MIG-24)", () => {
    const s = signEvidence(evidence, "staging-seal-2026-11", pem);
    const ruins: unknown[] = [
      [{ ...manifest[0]!, public_key_spki_b64: "não é base64 de chave" }],
      [{ ...manifest[0]!, public_key_spki_b64: 42 }],
      [{ ...manifest[0]!, valid_from: "ontem" }],
      [{ ...manifest[0]!, valid_until: "2026-13-40T99:00:00Z" }],
      [null],
      null,
      { kid: "staging-seal-2026-11" },
    ];
    for (const m of ruins) {
      expect(() => verifySeal(evidence, s, m as never, assinadoEm)).not.toThrow();
      expect(verifySeal(evidence, s, m as never, assinadoEm)).toBe(false);
    }
    for (const data of ["", "2026-11-20", "2026-11-20T14:00:00+03:00", "amanhã"]) {
      expect(verifySeal(evidence, s, manifest, data)).toBe(false);
    }
    expect(verifySeal(evidence, { ...s, sig_b64: 7 as never }, manifest, assinadoEm)).toBe(false);
    expect(verifySeal(evidence, null as never, manifest, assinadoEm)).toBe(false);
    // chave pública que não é Ed25519 no lugar certo do manifesto
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "der", type: "spki" });
    expect(verifySeal(evidence, s, [{ ...manifest[0]!, public_key_spki_b64: ec.toString("base64") }], assinadoEm)).toBe(false);
  });
});
