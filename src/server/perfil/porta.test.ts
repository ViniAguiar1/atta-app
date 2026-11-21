import { describe, expect, it } from "vitest";
import { escolherPortaPerfil } from "./porta";

describe("porta do Perfil da Clínica (MIG-42)", () => {
  it("na produção, sem o backend, o perfil vem vazio (null) e nada é gravado", async () => {
    const porta = escolherPortaPerfil("production");
    expect(await porta.perfil()).toEqual({ ok: true, data: null });
    expect((await porta.salvarCampo("trade_name", "Clínica Nova")).ok).toBe(false);
  });

  it("na prévia, no local e no CI vem a simulada, só com dado fictício e a máscara no gestor", async () => {
    for (const ambiente of ["preview", "development", undefined]) {
      const r = await escolherPortaPerfil(ambiente).perfil();
      expect(r.ok && r.data?.campos.commercial_email).toMatch(/@exemplo\.test$/);
      expect(r.ok && r.data?.gestor?.cpfMascarado).toMatch(/^···/);
    }
  });

  it("a simulada recusa trocar CNPJ e Razão social já informados (protected_field) e devolve o saved_at nos outros", async () => {
    const porta = escolherPortaPerfil("preview");
    for (const campo of ["cnpj", "legal_name"] as const) {
      expect(await porta.salvarCampo(campo, "x")).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0003:protected_field" } });
    }
    const r = await porta.salvarCampo("tax_registration", "123456");
    expect(r.ok && typeof r.data.salvoEm).toBe("string");
  });
});
