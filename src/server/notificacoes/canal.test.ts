import { describe, expect, it } from "vitest";
import { CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { abrirEndereco, mascararCelularDaEquipe, mascararEmail, normalizarEndereco, selarEndereco } from "./canal";

// Endereço da equipe das Notificações (MIG-15), com a KEK de TESTE e dados fictícios.
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const TENANT = "00000000-0000-4000-8000-00000000000a";
// as mesmas expressões do CHECK de atta_in.notification_channel
const MASCARA_EMAIL = /^[^\s@•]{1,2}•••@[^\s@.•]{1,2}•••(\.[^\s@.•]+)+$/;
const MASCARA_CELULAR = /^\(\d{2}\) •••••-••\d{2}$/;

describe("endereço da equipe nas Notificações", () => {
  it("valida no servidor: e-mail normalizado e celular com DDD (11 dígitos)", () => {
    expect(normalizarEndereco("email", "  Recepcao@Clinica-Ficticia.test ")).toBe("recepcao@clinica-ficticia.test");
    expect(normalizarEndereco("email", "sem-arroba")).toBeNull();
    expect(normalizarEndereco("whatsapp", "(11) 98765-0101")).toBe("11987650101");
    expect(normalizarEndereco("whatsapp", "(11) 3456-7890")).toBeNull(); // fixo não é WhatsApp de celular
    expect(normalizarEndereco("whatsapp", "(00) 98765-0101")).toBeNull(); // DDD que não existe
    expect(normalizarEndereco("email", 42)).toBeNull();
  });

  it("as máscaras batem com o formato que o banco confere e não mostram o endereço", () => {
    expect(mascararEmail("recepcao@clinicaficticia.com.br")).toBe("re•••@cl•••.com.br");
    expect(mascararEmail("a@b.test")).toMatch(MASCARA_EMAIL);
    expect(mascararCelularDaEquipe("11987650101")).toBe("(11) •••••-••01");
    expect(mascararCelularDaEquipe("11987650101")).toMatch(MASCARA_CELULAR);
  });

  it("sela pelo envelope da convenção e abre de volta; a máscara vai junto, o endereço não", async () => {
    for (const [canal, endereco] of [["email", "recepcao@clinica-ficticia.test"], ["whatsapp", "11987650101"]] as const) {
      const s = await selarEndereco({ tenantId: TENANT, canal, endereco }, { cofre });
      expect(s.p_address_masked).toMatch(canal === "email" ? MASCARA_EMAIL : MASCARA_CELULAR);
      expect(JSON.stringify(s)).not.toContain(endereco);
      const aberto = await abrirEndereco(
        { tenant_id: TENANT, address_enc: s.p_address_enc, envelope_id: s.p_envelope_id, dek_wrapped: s.p_dek_wrapped, kek_version: s.p_kek_version },
        cofre,
      );
      expect(aberto).toBe(endereco);
    }
  });

  it("o envelope é preso à clínica: em outra clínica não abre", async () => {
    const s = await selarEndereco({ tenantId: TENANT, canal: "email", endereco: "recepcao@clinica-ficticia.test" }, { cofre });
    await expect(
      abrirEndereco(
        { tenant_id: "00000000-0000-4000-8000-00000000000b", address_enc: s.p_address_enc, envelope_id: s.p_envelope_id, dek_wrapped: s.p_dek_wrapped, kek_version: s.p_kek_version },
        cofre,
      ),
    ).rejects.toThrow();
  });

  it("recusa selar valor fora do formato (a ação valida antes)", async () => {
    await expect(selarEndereco({ tenantId: TENANT, canal: "whatsapp", endereco: "(11) 98765-0101" }, { cofre })).rejects.toThrow(RangeError);
    await expect(selarEndereco({ tenantId: TENANT, canal: "email", endereco: "x" }, { cofre })).rejects.toThrow(RangeError);
  });
});
