import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOARDING_LOCAL_ATENDIMENTO,
  BOARDING_LOCAL_CLINICA,
  BOARDING_LOCAL_PIN,
  BOARDING_LOCAL_PROFISSIONAL,
  BOARDING_LOCAL_SEGREDO,
  BOARDING_LOCAL_VINCULO,
} from "../../../tests/fixtures/boarding-local";
import { CI_TEST_PIN_PEPPER_HEX } from "../../../tests/fixtures/cofre-ci";
import { hashDoSegredo } from "@/server/grant/politica";
import { pinMacWith, validarPin } from "@/server/pin/pin";

// Boarding Check do supabase/seed.sql com segredo e PIN FIXOS (repo público): só vale no local e no CI (regra do CTO,
// 21/11; molde do #264). Este teste prova as travas: o segredo e o mac não saem do seed local, e o PIN não confere com
// o pepper da nuvem.

const FIXTURE = "tests/fixtures/boarding-local.ts";
const SEED = "supabase/seed.sql";
const hashHex = hashDoSegredo(BOARDING_LOCAL_SEGREDO)!.toString("hex");
const frase = Buffer.from(BOARDING_LOCAL_SEGREDO, "base64url").toString("ascii");
const macHex = pinMacWith(Buffer.from(CI_TEST_PIN_PEPPER_HEX, "hex"), BOARDING_LOCAL_PROFISSIONAL, BOARDING_LOCAL_PIN).toString("hex");

const seed = readFileSync(SEED, "utf8");
const bloco = seed.split("MIG-23 (parte 3b): um Boarding Check pronto")[1] ?? "";

describe("Boarding Check do seed local (MIG-23 parte 3b)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("o seed leva o PIN de teste da profissional como pin_mac, versão 1, e o PIN não é óbvio", () => {
    expect(validarPin(BOARDING_LOCAL_PIN)).toEqual({ ok: true });
    expect(bloco).toContain(`('${BOARDING_LOCAL_PROFISSIONAL}', '\\x${macHex}', 1)`);
    expect(seed).not.toMatch(new RegExp(`'${BOARDING_LOCAL_PIN}'`));
  });

  it("o link sai pelo grant_issue e pelo grant_mark_sent do app, com só o sha256 do segredo fixo", () => {
    expect(bloco).toContain(`v_tenant constant uuid := '${BOARDING_LOCAL_CLINICA}'`);
    expect(bloco).toContain(`v_atendimento constant uuid := '${BOARDING_LOCAL_ATENDIMENTO}'`);
    expect(bloco).toContain("perform api.grant_mark_sent(api.grant_issue('professional_boarding',");
    expect(bloco).toContain(`'\\x${hashHex}'::bytea, v_tenant, v_atendimento, null,\n    '${BOARDING_LOCAL_VINCULO}'));`);
    expect(seed).not.toContain(BOARDING_LOCAL_SEGREDO);
    expect(seed).not.toContain(frase);
  });

  it.each(["preview", "production"])("na nuvem (%s) o pepper de teste do PIN é recusado: o PIN do seed não confere lá", async (ambiente) => {
    vi.stubEnv("VERCEL_ENV", ambiente);
    vi.stubEnv("ATTA_PIN_PEPPER", CI_TEST_PIN_PEPPER_HEX);
    const { pinMac } = await import("@/server/pin/pin");
    expect(() => pinMac(BOARDING_LOCAL_PROFISSIONAL, BOARDING_LOCAL_PIN)).toThrow();
  });

  it("o segredo fixo, o hash dele e o mac só existem na fixture e no seed.sql (nunca em scripts/seed-nuvem nem numa migration)", () => {
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
      if (texto.includes(BOARDING_LOCAL_SEGREDO) || texto.includes(frase)) comSegredo.push(a);
      if (texto.includes(hashHex) || texto.includes(macHex)) comHash.push(a);
    }
    expect(comSegredo).toEqual([FIXTURE]);
    expect(comHash).toEqual([SEED]);
  });

  it("nada do seed da nuvem lê o seed.sql nem a fixture do Boarding", () => {
    const daNuvem = execFileSync("git", ["ls-files", "-z", "scripts/seed-nuvem"], { encoding: "utf8" }).split("\0").filter(Boolean);
    expect(daNuvem.length).toBeGreaterThan(0);
    for (const a of daNuvem) {
      expect(readFileSync(a, "utf8"), a).not.toMatch(/seed\.sql|boarding-local|BOARDING_LOCAL_/);
    }
  });
});
