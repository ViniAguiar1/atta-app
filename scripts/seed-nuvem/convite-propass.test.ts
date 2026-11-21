import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CI_TEST_KEYRING } from "../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { emailHmacWith } from "@/server/crypto/email";
import { gerarSegredo } from "@/server/grant/politica";
import { abrirConvite } from "@/server/propass/convite";
import { gerarConvite, idsDoConvite } from "./convite-propass";
import { AURORA, PROFISSIONAIS, SERENA } from "./profissionais";

// Com a KEK e um pepper de TESTE: prova o formato e as travas, sem chave real.
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const pepperCpf = Buffer.alloc(32, 7);
const BASE = "https://atta-app.exemplo.test";

const bytea = (sql: string, coluna: number) => [...sql.matchAll(/'(\\x[0-9a-f]+)'::bytea/g)].map((m) => m[1]!)[coluna]!;

describe("convite de PROpass fictício da nuvem", () => {
  it("ids fixos por número, fora das faixas do seed da agenda, e e-mail @exemplo.test", () => {
    const ids = [1, 2, 49].map(idsDoConvite);
    const usados = new Set(PROFISSIONAIS.flatMap((p) => [p.id, p.vinculo, p.envelope]));
    for (const i of ids) {
      expect(i.email).toMatch(/^propass\.teste\.\d+@exemplo\.test$/);
      expect(usados.has(i.vinculo) || usados.has(i.envelope)).toBe(false);
    }
    expect(new Set(ids.flatMap((i) => [i.vinculo, i.envelope])).size).toBe(6);
    expect(() => idsDoConvite(0)).toThrow(RangeError);
    expect(() => idsDoConvite(50)).toThrow(RangeError);
  });

  it("o SQL leva só o sha256 do segredo, nunca o segredo nem o link; o link volta à parte, para o arquivo do QA", async () => {
    const segredo = gerarSegredo();
    const { sql, link } = await gerarConvite({ cofre, pepperCpf, numero: 1, segredo, baseUrl: BASE });
    expect(link).toBe(`${BASE}/propass/${segredo}`);
    expect(sql).not.toContain(segredo);
    expect(sql).not.toContain("/propass/");
    const hash = createHash("sha256").update(Buffer.from(segredo, "base64url")).digest("hex");
    expect(sql).toContain(`'\\x${hash}'::bytea`);
    expect(sql).toContain("private.propass_issue");
    expect(sql).toContain(AURORA);
    expect(sql).not.toMatch(/api\.professional_invite|delivery|enqueue/);   // nenhum e-mail sai
  });

  it("o e-mail do convite abre pela convenção do app (ADR 0001 §1) e o HMAC é o emailHmac", async () => {
    const { sql } = await gerarConvite({ cofre, pepperCpf, numero: 3, segredo: gerarSegredo(), baseUrl: BASE });
    const { envelope, email } = idsDoConvite(3);
    const aberto = await abrirConvite(
      { tenant_id: AURORA, invite_email_enc: bytea(sql, 1), invite_envelope_id: envelope, invite_dek_wrapped: bytea(sql, 2), invite_kek_version: 1 },
      cofre,
    );
    expect(aberto).toBe(email);
    expect(bytea(sql, 0)).toBe(`\\x${emailHmacWith(pepperCpf, email).toString("hex")}`);
  });

  it("recusa outra clínica, base de URL fora do formato e segredo inválido", async () => {
    const base = { cofre, pepperCpf, numero: 1, segredo: gerarSegredo(), baseUrl: BASE };
    await expect(gerarConvite({ ...base, clinica: SERENA })).rejects.toThrow("Aurora");
    await expect(gerarConvite({ ...base, baseUrl: "http://atta-app.exemplo.test" })).rejects.toThrow("base da URL");
    await expect(gerarConvite({ ...base, baseUrl: `${BASE}/propass` })).rejects.toThrow("base da URL");
    await expect(gerarConvite({ ...base, segredo: "curto" })).rejects.toThrow("segredo");
  });
});
