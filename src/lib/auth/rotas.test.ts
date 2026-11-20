import { describe, expect, it } from "vitest";
import { decidirGuarda, destinoSeguro, exigeSessao, ROTA_API_VERIFICACAO, ROTAS_PUBLICAS_DE_API } from "./rotas";

describe("rotas", () => {
  it("só o painel exige sessão", () => {
    expect(exigeSessao("/painel")).toBe(true);
    expect(exigeSessao("/painel/agenda")).toBe(true);
    expect(exigeSessao("/painelx")).toBe(false);
    expect(exigeSessao("/login")).toBe(false);
    expect(exigeSessao("/checkin/abc")).toBe(false);
  });

  it("volta só para caminho interno do painel", () => {
    expect(destinoSeguro("/painel/agenda?dia=2026-11-20")).toBe("/painel/agenda?dia=2026-11-20");
    expect(destinoSeguro("/painel")).toBe("/painel");
    // os casos pedidos pelo Tech Lead (ADR 0001 §4), mais alguns
    for (const ruim of [null, "", "//evil.com", "https://evil.com/painel", "/\\evil", "/painel/../x", "//mal.example/painel",
      "/login", "javascript:alert(1)", "/painel@evil.com"]) {
      expect(destinoSeguro(ruim)).toBe("/painel");
    }
  });

  it("guarda do painel: sessão, clínica e o segundo fator do ADMIN", () => {
    const admin = { tenant_id: "t", app_role: "ADMIN", aal: "aal1" };
    expect(decidirGuarda("/login", "", null)).toBeNull();
    expect(decidirGuarda("/login", "", admin)).toBe("/painel");
    expect(decidirGuarda("/", "", null)).toBe("/login");
    expect(decidirGuarda("/", "", admin)).toBe("/painel");
    expect(decidirGuarda("/checkin/abc", "", null)).toBeNull();
    expect(decidirGuarda("/painel/agenda", "?dia=1", null)).toBe("/login?volta=%2Fpainel%2Fagenda%3Fdia%3D1");
    expect(decidirGuarda("/painel", "", { app_role: "ADMIN" })).toBe("/sem-clinica");
    expect(decidirGuarda("/painel/agenda", "", admin)).toBe("/painel/seguranca/2fa?volta=%2Fpainel%2Fagenda");
    expect(decidirGuarda("/painel/seguranca/2fa", "", admin)).toBeNull();
    expect(decidirGuarda("/painel/agenda", "", { ...admin, aal: "aal2" })).toBeNull();
    expect(decidirGuarda("/painel/agenda", "", { tenant_id: "t", app_role: "COLABORADOR", aal: "aal1" })).toBeNull();
  });
});

describe("API pública da verificação (MIG-24)", () => {
  it("fica fora da guarda de staff, com e sem sessão", () => {
    expect(ROTAS_PUBLICAS_DE_API).toContain("/public/v1/verificar");
    expect(exigeSessao(`${ROTA_API_VERIFICACAO}/ATTA-7K3M-9QPX-2B4D`)).toBe(false);
    expect(decidirGuarda(`${ROTA_API_VERIFICACAO}/ATTA-7K3M-9QPX-2B4D`, "", null)).toBeNull();
  });
});
