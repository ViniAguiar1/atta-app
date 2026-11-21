import { describe, expect, it } from "vitest";
import { escolherPortaPerfil } from "./porta";
import { portaPerfilReal } from "./real";
import { portaPerfilSimulada } from "./simulado";
import { portaPerfilVazia } from "./vazia";

describe("porta do Perfil da Clínica (MIG-42)", () => {
  it("a leitura e a gravação vão à porta real em todos os ambientes (backend do #296)", () => {
    for (const ambiente of ["production", "preview", "development", undefined]) {
      const porta = escolherPortaPerfil(ambiente);
      expect(porta.perfil).toBe(portaPerfilReal.perfil);
      expect(porta.salvarCampo).toBe(portaPerfilReal.salvarCampo);
    }
  });

  it("a vazia não inventa nada e não grava", async () => {
    expect(await portaPerfilVazia.perfil()).toEqual({ ok: true, data: null });
    expect((await portaPerfilVazia.salvarCampo("trade_name", "Clínica Nova")).ok).toBe(false);
  });

  it("a simulada só tem dado fictício, a máscara no gestor e recusa trocar CNPJ e Razão social (protected_field)", async () => {
    const r = await portaPerfilSimulada.perfil();
    expect(r.ok && r.data?.campos.commercial_email).toMatch(/@exemplo\.test$/);
    expect(r.ok && r.data?.gestor?.cpfMascarado).toMatch(/^···/);
    for (const campo of ["cnpj", "legal_name"] as const) {
      expect(await portaPerfilSimulada.salvarCampo(campo, "x")).toMatchObject({
        ok: false,
        error: { code: "CONFLITO", reason: "ATTA-IN-0003:protected_field" },
      });
    }
  });
});
