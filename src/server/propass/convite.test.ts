import { describe, expect, it } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith, isValidCpf } from "@/server/crypto/cpf";
import { emailHmacWith } from "@/server/crypto/email";
import { columnAad, open } from "@/server/crypto/envelope";
import { deBytea } from "@/server/pacientes/contato";
import { abrirConvite, selarConvite, selarProfissional } from "./convite";

// Só KEK e pepper de TESTE (tests/fixtures/cofre-ci.ts); dados fictícios (CPF gerado, e-mail @exemplo.test).
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const pepper = Buffer.from(CI_TEST_CPF_PEPPER_HEX, "hex");
const hmacDoEmail = (e: string) => emailHmacWith(pepper, e);
const hmacDoCpf = (c: string) => cpfHmacWith(pepper, c);
const TENANT = "00000000-0000-4000-8000-00000000000a";
const OUTRA = "00000000-0000-4000-8000-00000000000b";

describe("envelope do convite (vínculo, ADR 0001 §1)", () => {
  it("ida e volta: o e-mail normalizado volta, e o HMAC é o emailHmac", async () => {
    const c = await selarConvite({ tenantId: TENANT, email: "  Dra.Ficticia@Exemplo.test " }, { cofre, hmacDoEmail });
    expect(deBytea(c.invite_email_hmac).equals(hmacDoEmail("dra.ficticia@exemplo.test"))).toBe(true);
    const email = await abrirConvite(
      { tenant_id: TENANT, invite_email_enc: c.invite_email_enc, invite_envelope_id: c.envelope_id,
        invite_dek_wrapped: c.dek_wrapped, invite_kek_version: c.kek_version },
      cofre,
    );
    expect(email).toBe("dra.ficticia@exemplo.test");
  });

  it("outra clínica ou outro envelope não abre (a AAD prende o valor ao lugar)", async () => {
    const c = await selarConvite({ tenantId: TENANT, email: "dra@exemplo.test" }, { cofre, hmacDoEmail });
    const base = { invite_email_enc: c.invite_email_enc, invite_dek_wrapped: c.dek_wrapped, invite_kek_version: c.kek_version };
    await expect(abrirConvite({ ...base, tenant_id: OUTRA, invite_envelope_id: c.envelope_id }, cofre)).rejects.toThrow();
    await expect(
      abrirConvite({ ...base, tenant_id: TENANT, invite_envelope_id: "00000000-0000-4000-8000-0000000000ff" }, cofre),
    ).rejects.toThrow();
  });

  it("e-mail fora da forma é recusado sem gerar chave", async () => {
    await expect(selarConvite({ tenantId: TENANT, email: "sem-arroba" }, { cofre, hmacDoEmail })).rejects.toThrow(RangeError);
  });

  it("conformidade: abre o convite do seed (supabase/seed.sql, vínculo …311) e o HMAC bate", async () => {
    const email = await abrirConvite(
      { tenant_id: "eeee0000-0000-4000-8000-000000000001", invite_email_enc: "\\x01000138ed5014978c72cd2e74fa7261685b47bdceb58a1b23823a5ad9addfda072b5f6186313db8fab9cac51c6f65ef8b58e2dcd6ef3d328bf0cb918ffe",
        invite_envelope_id: "eeee0000-0000-4000-8000-000000000312", invite_dek_wrapped: "\\x010001cf0b4ed20f4e3e090d709044dc6d5c2afbb45a4f3008850cb55bec9cf949113a058d7b8ac0adf3da0e7d08da4e9cfbecc23ee8957b3b1ff987ddcdcb", invite_kek_version: 1 },
      cofre,
    );
    expect(hmacDoEmail(email).equals(deBytea("\\x77c4c915fadc4a17c69d8328e75ceb3425bd0ff543f3bd751cf0e925f670b799"))).toBe(true);
  });
});

describe("envelope do profissional (PROpass)", () => {
  it("cifra CPF, celular e e-mail com a AAD de cada coluna; CPF mascarado e HMACs", async () => {
    const p = await selarProfissional({ cpf: "529.982.247-25", celular: "(11) 99001-0001", email: "Dra@Exemplo.test" },
                                      { cofre, hmacDoCpf, hmacDoEmail });
    expect(p.cpf_masked).toBe("\u00b7\u00b7\u00b7.\u00b7\u00b7\u00b7.247-25");
    expect(deBytea(p.cpf_hmac).equals(hmacDoCpf("52998224725"))).toBe(true);
    expect(deBytea(p.email_hmac).equals(hmacDoEmail("dra@exemplo.test"))).toBe(true);
    const dek = await cofre.unwrapDataKey(
      { kekVersion: p.kek_version, blob: deBytea(p.dek_wrapped) },
      { tenant_id: "", table: "platform.professional", column: "dek", id: p.professional_id },
    );
    const abrir = (v: string, col: string) => open(deBytea(v), dek, columnAad("", "platform.professional", col, p.professional_id)).toString("utf8");
    expect(abrir(p.cpf_enc, "cpf_enc")).toBe("52998224725");
    expect(abrir(p.phone_enc, "phone_enc")).toBe("11990010001");
    expect(abrir(p.email_enc, "email_enc")).toBe("dra@exemplo.test");
    expect(() => abrir(p.cpf_enc, "phone_enc")).toThrow();
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("CPF inválido, e-mail fora da forma e celular fora do formato são recusados", async () => {
    const deps = { cofre, hmacDoCpf, hmacDoEmail };
    await expect(selarProfissional({ cpf: "111.111.111-11", celular: "11990010001", email: "a@exemplo.test" }, deps)).rejects.toThrow(RangeError);
    await expect(selarProfissional({ cpf: "52998224725", celular: "11990010001", email: "x" }, deps)).rejects.toThrow(RangeError);
    await expect(selarProfissional({ cpf: "52998224725", celular: "abc", email: "a@exemplo.test" }, deps)).rejects.toThrow(RangeError);
    // §16.6: DDD válido e 9 na frente, 11 dígitos (como o celular do paciente)
    for (const celular of ["1199001000", "+55 11 99001-0001", "20990010001", "11890010001"]) {
      await expect(selarProfissional({ cpf: "52998224725", celular, email: "a@exemplo.test" }, deps), celular).rejects.toThrow(RangeError);
    }
  });
});
