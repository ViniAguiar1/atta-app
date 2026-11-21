import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarSegredo, hashDoSegredo, MAX_USOS, opcoesDoCookie, POLITICA } from "./politica";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261120160000_platform_access_grant.sql"),
  "utf8",
);
const migrationPropass = readFileSync(
  join(process.cwd(), "supabase/migrations/20261120211920_platform_propass.sql"),
  "utf8",
);

describe("política do grant", () => {
  it("os números batem com private.grant_policy (o banco decide; a regra fica num lugar só)", () => {
    expect(POLITICA.patient_checkin).toEqual({ inatividadeSeg: 1800, tetoSeg: 7200 });
    expect(POLITICA.professional_boarding).toEqual({ inatividadeSeg: null, tetoSeg: 28800 });
    expect(migration).toContain("when 'patient_checkin' then interval '30 minutes'");
    expect(migration).toContain("when 'patient_checkin' then interval '2 hours'");
    expect(migration).toContain("when 'professional_boarding' then interval '8 hours'");
  });

  it("o link do PROpass vale 7 dias, sem inatividade, como em private.grant_policy (PDD §10.4.3)", () => {
    expect(POLITICA.professional_propass).toEqual({ inatividadeSeg: null, tetoSeg: 604800 });
    expect(migrationPropass).toContain("when 'professional_propass' then interval '7 days'");
  });

  it("o download dos PDFs do PROpass vale 30 min absolutos e no máximo 20 vezes, como no banco (ADR 0001)", () => {
    const download = readFileSync(join(process.cwd(), "supabase/migrations/20261121144506_platform_propass_download_grant.sql"), "utf8");
    expect(POLITICA.propass_download).toEqual({ inatividadeSeg: null, tetoSeg: 1800 });
    expect(MAX_USOS).toEqual({ propass_download: 20 });
    expect(download).toContain("when 'propass_download' then interval '30 minutes'");
    expect(download).toContain("case p_purpose when 'propass_download' then 20 end");
  });

  it("segredo de 32 bytes, diferente a cada vez; o hash é o sha256 de 32 bytes", () => {
    const a = gerarSegredo();
    const b = gerarSegredo();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
    expect(hashDoSegredo(a)).toHaveLength(32);
    expect(hashDoSegredo(a)?.equals(hashDoSegredo(a) as Buffer)).toBe(true);
  });

  it("segredo fora do formato não vira hash (não vai ao banco)", () => {
    for (const ruim of ["", "curto", "x".repeat(44), `${"a".repeat(42)}=`, "a b".repeat(15)]) {
      expect(hashDoSegredo(ruim), ruim).toBeNull();
    }
  });

  it("cookie HttpOnly, SameSite=Lax, Path=/, sem Domain, e Secure em https (como a sessão)", () => {
    const o = opcoesDoCookie("patient_checkin", true);
    expect(o).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7200 });
    expect("domain" in o).toBe(false);
    expect(opcoesDoCookie("professional_boarding", false)).toMatchObject({ secure: false, maxAge: 28800 });
  });
});
