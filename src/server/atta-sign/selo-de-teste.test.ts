// Chave de selo de TESTE do ATTA Sign: as travas para ela nunca valer na nuvem e a varredura do repositório (contrato
// do Tech Lead, 21/11; pedido do Frontend 6 para o e2e do PROpass). Só dado fictício.
import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CI_TEST_SEAL_FINGERPRINT as FIXTURE_FP,
  CI_TEST_SEAL_KID,
  CI_TEST_SEAL_PRIVATE_KEY,
  CI_TEST_SEAL_PUBLIC_SPKI_HEX,
} from "../../../tests/fixtures/selo-ci";
import { signEvidence, verifySeal } from "./seal";
import { CI_TEST_SEAL_FINGERPRINT, chaveDoAmbiente } from "./termo-autorizacao";

const RAIZ = join(__dirname, "..", "..", "..");
const spkiDaPrivada = (pem: string) => createPublicKey(pem).export({ type: "spki", format: "der" });
const outraChave = () => generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("chave de selo de teste (tests/fixtures/selo-ci.ts)", () => {
  it("a impressão digital do servidor é a da fixture, e a pública sai da privada", () => {
    expect(CI_TEST_SEAL_FINGERPRINT).toBe(FIXTURE_FP);
    const spki = spkiDaPrivada(CI_TEST_SEAL_PRIVATE_KEY);
    expect(spki.toString("hex")).toBe(CI_TEST_SEAL_PUBLIC_SPKI_HEX);
    expect(createHash("sha256").update(spki).digest("hex")).toBe(FIXTURE_FP);
  });

  it("assina e confere como qualquer chave Ed25519 (serve ao e2e)", () => {
    const evidencia = "a".repeat(64);
    const selo = signEvidence(evidencia, CI_TEST_SEAL_KID, CI_TEST_SEAL_PRIVATE_KEY);
    const manifesto = [{ kid: CI_TEST_SEAL_KID, alg: "Ed25519" as const,
      public_key_spki_b64: Buffer.from(CI_TEST_SEAL_PUBLIC_SPKI_HEX, "hex").toString("base64"),
      valid_from: "2026-01-01T00:00:00.000Z", valid_until: null }];
    expect(verifySeal(evidencia, selo, manifesto, "2026-11-21T10:00:00.000Z")).toBe(true);
  });

  it("vale no local e no CI (sem VERCEL_ENV)", () => {
    expect(chaveDoAmbiente({ ATTA_SEAL_KID: CI_TEST_SEAL_KID, ATTA_SEAL_PRIVATE_KEY: CI_TEST_SEAL_PRIVATE_KEY }).kid).toBe(CI_TEST_SEAL_KID);
  });

  for (const ambiente of ["preview", "production"]) {
    it(`em ${ambiente}: recusa a chave de teste, mesmo com outro kid, sem ecoar a chave`, () => {
      let mensagem = "";
      try {
        chaveDoAmbiente({ VERCEL_ENV: ambiente, ATTA_SEAL_KID: "seal-2026-11", ATTA_SEAL_PRIVATE_KEY: CI_TEST_SEAL_PRIVATE_KEY });
      } catch (e) {
        mensagem = (e as Error).message;
      }
      expect(mensagem).toMatch(/não vale na prévia nem na produção/);
      expect(mensagem).not.toContain(CI_TEST_SEAL_PRIVATE_KEY.split("\n")[1]!);
    });

    it(`em ${ambiente}: a trava é só pela impressão digital: chave real vale com qualquer kid; chave ilegível não`, () => {
      const real = outraChave();
      for (const kid of ["seal-2026-11", "staging-seal-previa-real"]) {
        expect(chaveDoAmbiente({ VERCEL_ENV: ambiente, ATTA_SEAL_KID: kid, ATTA_SEAL_PRIVATE_KEY: real }).kid).toBe(kid);
      }
      expect(() => chaveDoAmbiente({ VERCEL_ENV: ambiente, ATTA_SEAL_KID: "seal-2026-11", ATTA_SEAL_PRIVATE_KEY: "não é PEM" })).toThrow();
      expect(chaveDoAmbiente({ VERCEL_ENV: ambiente, ATTA_SEAL_KID: "seal-2026-11", ATTA_SEAL_PRIVATE_KEY: real }).kid).toBe("seal-2026-11");
    });
  }

  it("o padrão lê o process.env (vi.stubEnv)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATTA_SEAL_KID", CI_TEST_SEAL_KID);
    vi.stubEnv("ATTA_SEAL_PRIVATE_KEY", CI_TEST_SEAL_PRIVATE_KEY);
    expect(() => chaveDoAmbiente()).toThrow(/não vale/);
  });

  it("varredura: a privada só na fixture; a pública só na fixture e no seed.sql; nada em migration nem em seed-nuvem", () => {
    const linhaDaPrivada = CI_TEST_SEAL_PRIVATE_KEY.split("\n")[1]!;
    const fixture = join(RAIZ, "tests", "fixtures", "selo-ci.ts");
    const servidor = join(RAIZ, "src", "server", "atta-sign", "termo-autorizacao.ts");
    const seed = join(RAIZ, "supabase", "seed.sql");
    const todos = ["src", "supabase", "scripts", "e2e", "tests"].flatMap((d) => arquivos(join(RAIZ, d)))
      .filter((f) => !f.includes("node_modules") && !f.endsWith("selo-de-teste.test.ts"));
    for (const f of todos) {
      const texto = readFileSync(f, "utf8");
      if (f !== fixture) expect(texto.includes(linhaDaPrivada), f).toBe(false);
      if (f !== fixture && f !== seed) expect(texto.includes(CI_TEST_SEAL_PUBLIC_SPKI_HEX), f).toBe(false);
      if (f !== fixture && f !== servidor) expect(texto.includes(FIXTURE_FP), f).toBe(false);
    }
    for (const f of [...arquivos(join(RAIZ, "supabase", "migrations")), ...arquivos(join(RAIZ, "scripts", "seed-nuvem"))]) {
      expect(readFileSync(f, "utf8").includes(CI_TEST_SEAL_KID), f).toBe(false);
    }
    expect(readFileSync(seed, "utf8")).toContain(CI_TEST_SEAL_PUBLIC_SPKI_HEX);
  });
});
