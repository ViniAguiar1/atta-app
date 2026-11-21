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

  it("a simulada recusa CNPJ inválido como o banco e devolve o saved_at no válido", async () => {
    const porta = escolherPortaPerfil("preview");
    expect(await porta.salvarCampo("cnpj", "11222333000182")).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    const r = await porta.salvarCampo("cnpj", "11222333000181");
    expect(r.ok && typeof r.data.salvoEm).toBe("string");
  });
});
