import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gerarSegredo, hashDoSegredo, opcoesDoCookie, POLITICA } from "./politica";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261120160000_platform_access_grant.sql"),
  "utf8",
);

describe("política do grant", () => {
  it("os números batem com private.grant_policy (o banco decide; a regra fica num lugar só)", () => {
    expect(POLITICA.patient_checkin).toEqual({ inatividadeSeg: 1800, tetoSeg: 7200 });
    expect(POLITICA.professional_boarding).toEqual({ inatividadeSeg: null, tetoSeg: 43200 });
    expect(migration).toContain("when 'patient_checkin' then interval '30 minutes'");
    expect(migration).toContain("when 'patient_checkin' then interval '2 hours'");
    expect(migration).toContain("when 'professional_boarding' then interval '12 hours'");
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

  it("cookie HttpOnly, Secure, SameSite=Lax, Path=/ e sem Domain", () => {
    const o = opcoesDoCookie("patient_checkin");
    expect(o).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 7200 });
    expect("domain" in o).toBe(false);
  });
});
