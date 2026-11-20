import { describe, expect, it } from "vitest";
import { CI_TEST_KEYRING } from "../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith, isValidCpf } from "@/server/crypto/cpf";
import { columnAad, open } from "@/server/crypto/envelope";
import { cpfDe, PACIENTES, parametrosDeCadastro } from "./pacientes";

// O seed da nuvem com a KEK e um pepper de TESTE: prova o formato (o mesmo da ADR 0002 §6) sem nenhuma chave real.
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const pepperCpf = Buffer.alloc(32, 7);
const deBytea = (v: string) => Buffer.from(v.slice(2), "hex");

describe("seed de pacientes fictícios da nuvem", () => {
  it("18 pacientes, ids únicos, CPFs válidos e únicos, contatos fictícios e nenhum dado de saúde", () => {
    expect(PACIENTES).toHaveLength(18);
    expect(new Set(PACIENTES.map((p) => p.id)).size).toBe(18);
    const cpfs = PACIENTES.filter((p) => p.cpfBase).map((p) => cpfDe(p.cpfBase!));
    expect(new Set(cpfs).size).toBe(cpfs.length);
    for (const c of cpfs) expect(isValidCpf(c)).toBe(true);
    for (const p of PACIENTES) {
      if (p.email) expect(p.email).toMatch(/@exemplo\.test$/);
      if (p.celular) expect(p.celular).toMatch(/^1199001\d{4}$/);
      expect(Object.keys(p).every((k) => ["id", "nome", "nomeSocial", "nascimento", "cpfBase", "celular", "email"].includes(k))).toBe(true);
    }
    expect(PACIENTES.filter((p) => !p.cpfBase)).toHaveLength(2);
    expect(PACIENTES.filter((p) => p.nomeSocial)).toHaveLength(3);
  });

  it("CPF, celular e e-mail abrem pela convenção do app; o HMAC bate; incompleto vai sem CPF", async () => {
    for (const p of PACIENTES) {
      const r = await parametrosDeCadastro(p, { cofre, pepperCpf });
      expect(r.p_is_incomplete).toBe(!p.cpfBase);
      if (!r.p_dek_wrapped) continue;
      const dek = await cofre.unwrapDataKey(
        { kekVersion: r.p_kek_version!, blob: deBytea(r.p_dek_wrapped) },
        { tenant_id: "", table: "network.person", column: "dek", id: p.id },
      );
      const abrir = (v: string | null, col: string) => (v ? open(deBytea(v), dek, columnAad("", "network.person", col, p.id)).toString("utf8") : null);
      if (p.cpfBase) {
        const cpf = cpfDe(p.cpfBase);
        expect(abrir(r.p_cpf_enc, "cpf_enc")).toBe(cpf);
        expect(r.p_cpf_hmac).toBe(`\\x${cpfHmacWith(pepperCpf, cpf).toString("hex")}`);
        expect(r.p_cpf_masked).toMatch(/^···\.···\.\d{3}-\d{2}$/);
      } else {
        expect([r.p_cpf_hmac, r.p_cpf_masked, r.p_cpf_enc]).toEqual([null, null, null]);
      }
      expect(abrir(r.p_phone_enc, "phone_enc")).toBe(p.celular ?? null);
      expect(abrir(r.p_email_enc, "email_enc")).toBe(p.email ?? null);
      // o valor de um paciente não abre como se fosse de outro (AAD amarrada ao id)
      if (r.p_cpf_enc) expect(() => open(deBytea(r.p_cpf_enc!), dek, columnAad("", "network.person", "cpf_enc", PACIENTES[17]!.id))).toThrow();
    }
  });
});
