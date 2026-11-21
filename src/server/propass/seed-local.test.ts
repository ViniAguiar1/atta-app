import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import {
  PROPASS_LOCAL_CLINICA,
  PROPASS_LOCAL_EMAIL,
  PROPASS_LOCAL_ENVELOPE,
  PROPASS_LOCAL_SEGREDO,
  PROPASS_LOCAL_VINCULO,
} from "../../../tests/fixtures/propass-convite-local";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { emailHmacWith } from "@/server/crypto/email";
import { hashDoSegredo } from "@/server/grant/politica";
import { abrirConvite } from "./convite";

// Convite de PROpass do supabase/seed.sql com segredo FIXO (repo público): só vale no local e no CI (regra do CTO,
// 21/11). Este teste prova as travas: o segredo não sai do seed local, e o convite não abre com o cofre da nuvem.

const FIXTURE = "tests/fixtures/propass-convite-local.ts";
const SEED = "supabase/seed.sql";
const hashHex = hashDoSegredo(PROPASS_LOCAL_SEGREDO)!.toString("hex");
const frase = Buffer.from(PROPASS_LOCAL_SEGREDO, "base64url").toString("ascii");

const seed = readFileSync(SEED, "utf8");
const bloco = seed.split("MIG-14b: um convite de PROpass pendente")[1] ?? "";
const linha = bloco.match(/^\s+\('([^']+)', '([^']+)', '(\\x[0-9a-f]+)', '(\\x[0-9a-f]+)', '([^']+)', '(\\x[0-9a-f]+)', (\d+)\);$/m);

describe("convite de PROpass do seed local (MIG-14b)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("o seed leva o vínculo pendente na clínica fictícia e só o sha256 do segredo fixo, nunca o segredo", () => {
    expect(linha).not.toBeNull();
    const [, vinculo, clinica, , , envelope] = linha!;
    expect([vinculo, clinica, envelope]).toEqual([PROPASS_LOCAL_VINCULO, PROPASS_LOCAL_CLINICA, PROPASS_LOCAL_ENVELOPE]);
    expect(bloco).toContain(`private.propass_issue('${PROPASS_LOCAL_CLINICA}', '${PROPASS_LOCAL_VINCULO}',\n  '\\x${hashHex}'::bytea)`);
    expect(seed).not.toContain(PROPASS_LOCAL_SEGREDO);
    expect(seed).not.toContain(frase);
    expect(PROPASS_LOCAL_EMAIL).toMatch(/@exemplo\.test$/);
  });

  it("o e-mail do convite abre com a KEK de TESTE pela convenção do app e o HMAC é o do pepper de teste", async () => {
    const [, , clinica, hmac, enc, envelope, dek, kek] = linha!;
    const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
    const email = await abrirConvite(
      { tenant_id: clinica!, invite_email_enc: enc!, invite_envelope_id: envelope!, invite_dek_wrapped: dek!, invite_kek_version: Number(kek) },
      cofre,
    );
    expect(email).toBe(PROPASS_LOCAL_EMAIL);
    expect(hmac).toBe(`\\x${emailHmacWith(Buffer.from(CI_TEST_CPF_PEPPER_HEX, "hex"), PROPASS_LOCAL_EMAIL).toString("hex")}`);
  });

  it.each(["preview", "production"])("na nuvem (%s) o cofre recusa a KEK de teste: o convite do seed não abre lá", async (ambiente) => {
    vi.stubEnv("VERCEL_ENV", ambiente);
    vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
    const { getCofre } = await import("@/server/cofre");
    expect(() => getCofre("network")).toThrow();
  });

  it("o segredo fixo e o hash dele só existem na fixture e no seed.sql (nunca em scripts/seed-nuvem nem numa migration)", () => {
    const arquivos = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
    const comSegredo: string[] = [];
    const comHash: string[] = [];
    for (const a of arquivos) {
      let texto: string;
      try {
        texto = readFileSync(a, "utf8");
      } catch {
        continue; // removido na worktree, ainda não commitado
      }
      if (texto.includes(PROPASS_LOCAL_SEGREDO) || texto.includes(frase)) comSegredo.push(a);
      if (texto.includes(hashHex)) comHash.push(a);
    }
    expect(comSegredo).toEqual([FIXTURE]);
    expect(comHash).toEqual([SEED]);
  });

  it("o seed.sql só roda no db reset local, e nada do seed da nuvem o lê nem usa a fixture", () => {
    const config = readFileSync("supabase/config.toml", "utf8");
    expect(config.match(/^sql_paths = (.+)$/m)?.[1]).toBe('["./seed.sql"]');
    const daNuvem = execFileSync("git", ["ls-files", "-z", "scripts/seed-nuvem"], { encoding: "utf8" }).split("\0").filter(Boolean);
    expect(daNuvem.length).toBeGreaterThan(0);
    for (const a of daNuvem) {
      const texto = readFileSync(a, "utf8");
      expect(texto, a).not.toMatch(/seed\.sql|propass-convite-local|PROPASS_LOCAL_/);
    }
  });
});
