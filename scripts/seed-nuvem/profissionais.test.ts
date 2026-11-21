import { describe, expect, it } from "vitest";
import { CI_TEST_KEYRING } from "../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith, isValidCpf, maskCpf } from "@/server/crypto/cpf";
import { emailHmacWith } from "@/server/crypto/email";
import { columnAad, open } from "@/server/crypto/envelope";
import { cpfDe, PACIENTES } from "./pacientes";
import { AURORA, PROFISSIONAIS, SERENA, sqlDosProfissionais } from "./profissionais";

// Com a KEK e um pepper de TESTE: prova o formato (ADR 0002 §6, o mesmo do seed local do #141) sem chave real.
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const pepperCpf = Buffer.alloc(32, 7);
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

// valores de uma linha "insert … values (…)": os bytea vêm como '\x…'
const valores = (linha: string) => [...linha.matchAll(/'((?:[^']|'')*)'|(\d+)|now\(\)/g)].map((m) => m[1] ?? m[2] ?? "now()");

describe("profissionais fictícios da agenda da nuvem", () => {
  it("2 por clínica, ids e registros únicos, CPF válido e fora dos pacientes, e-mail @exemplo.test", () => {
    expect(PROFISSIONAIS.filter((p) => p.clinica === AURORA)).toHaveLength(2);
    expect(PROFISSIONAIS.filter((p) => p.clinica === SERENA)).toHaveLength(2);
    const ids = PROFISSIONAIS.flatMap((p) => [p.id, p.vinculo, p.envelope]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(PROFISSIONAIS.map((p) => p.registro)).size).toBe(4);
    const cpfsPacientes = new Set(PACIENTES.filter((p) => p.cpfBase).map((p) => p.cpfBase));
    for (const p of PROFISSIONAIS) {
      expect(isValidCpf(cpfDe(p.cpfBase))).toBe(true);
      expect(cpfsPacientes.has(p.cpfBase)).toBe(false);
      expect(p.email).toMatch(/@exemplo\.test$/);
      expect(p.registro).toMatch(/^000\d{3}$/);
    }
  });

  it("o SQL não leva CPF nem e-mail em claro; tudo abre pela convenção do app e o HMAC bate", async () => {
    const sql = await sqlDosProfissionais({ cofre, pepperCpf });
    const linhas = sql.trim().split("\n");
    expect(linhas).toHaveLength(8);
    for (const p of PROFISSIONAIS) {
      const cpf = cpfDe(p.cpfBase);
      expect(sql).not.toContain(cpf);
      expect(sql).not.toContain(p.email);

      const prof = valores(linhas.find((l) => l.startsWith("insert into platform.professional ") && l.includes(`'${p.id}'`))!);
      const [, , , , , cpfHmac, mascara, cpfEnc, emailEnc, emailHmac, dekWrapped, kekVersion] = prof;
      expect(cpfHmac).toBe(`\\x${hex(cpfHmacWith(pepperCpf, cpf))}`);
      expect(emailHmac).toBe(`\\x${hex(emailHmacWith(pepperCpf, p.email))}`);
      expect(mascara).toBe(maskCpf(cpf));
      const dek = await cofre.unwrapDataKey({ kekVersion: Number(kekVersion), blob: Buffer.from(dekWrapped!.slice(2), "hex") },
        { tenant_id: "", table: "platform.professional", column: "dek", id: p.id });
      const abrir = (v: string, col: string) => open(Buffer.from(v.slice(2), "hex"), dek, columnAad("", "platform.professional", col, p.id)).toString("utf8");
      expect(abrir(cpfEnc!, "cpf_enc")).toBe(cpf);
      expect(abrir(emailEnc!, "email_enc")).toBe(p.email);

      const vinc = valores(linhas.find((l) => l.startsWith("insert into platform.professional_tenant_link ") && l.includes(`'${p.vinculo}'`))!);
      const [, clinica, profissional, conviteHmac, conviteEnc, envelope, dekV, kekV] = vinc;
      expect([clinica, profissional, envelope, conviteHmac]).toEqual([p.clinica, p.id, p.envelope, emailHmac]);
      const dekVinculo = await cofre.unwrapDataKey({ kekVersion: Number(kekV), blob: Buffer.from(dekV!.slice(2), "hex") },
        { tenant_id: p.clinica, table: "platform.professional_tenant_link", column: "dek", id: p.envelope });
      expect(open(Buffer.from(conviteEnc!.slice(2), "hex"), dekVinculo,
        columnAad(p.clinica, "platform.professional_tenant_link", "invite_email_enc", p.envelope)).toString("utf8")).toBe(p.email);
    }
  });
});
