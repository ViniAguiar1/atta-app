// Formato 1 (envelope e dek_wrapped) contra os vetores congelados do atta-core, e o Cofre (ADR 0002).
// O HMAC de CPF (hmac_cpf.json), o RNE e o selo entram no MIG-21c.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fingerprint, MasterKeyCofre, parseKeyring } from "../../src/server/cofre/master-key";
import type { CofreContext } from "../../src/server/cofre/types";
import { columnAad, CryptoError, keyVersionOf, legacyDataKeyAad, open, seal } from "../../src/server/crypto/envelope";
import { CI_TEST_KEK_FINGERPRINT, getCofre } from "../../src/server/cofre/index";
import { CI_TEST_KEK_HEX, CI_TEST_KEYRING } from "../fixtures/cofre-ci";

const vector = (name: string) => JSON.parse(readFileSync(join(__dirname, "../vectors/crypto_v1", `${name}.json`), "utf8"));
const hex = (s: string) => Buffer.from(s, "hex");

describe("crypto_v1 (vetores do atta-core, byte a byte)", () => {
  it("envelope.json decifra com a AAD de coluna", () => {
    const v = vector("envelope");
    const aad = columnAad(v.tenant_id, v.tabela, v.coluna, v.id);
    expect(aad.toString("ascii")).toBe(v.aad);
    const value = hex(v.valor_hex);
    expect(keyVersionOf(value)).toBe(v.key_version);
    expect(open(value, hex(v.dek_hex), aad, v.key_version).toString("utf8")).toBe(v.claro);
  });

  it("dek_wrapped.json abre com a KEK, o tenant e a versão (contêiner do Cofre)", () => {
    const v = vector("dek_wrapped");
    const aad = legacyDataKeyAad(v.tenant_id);
    expect(aad.toString("ascii")).toBe(v.aad);
    expect(open(hex(v.dek_wrapped_hex), hex(v.kek_hex), aad, v.key_version).toString("hex")).toBe(v.dek_hex);
    expect(() => open(hex(v.dek_wrapped_hex), hex(v.kek_hex), legacyDataKeyAad("0199c1b4-0000-7000-8000-000000000002"), 1)).toThrow(CryptoError);
    expect(() => open(hex(v.dek_wrapped_hex), hex(v.kek_hex), aad, 2)).toThrow(CryptoError);
  });

  it("adulterar AAD ou um byte falha com CRYPTO_FAILED", () => {
    const v = vector("envelope");
    const value = hex(v.valor_hex);
    const otherRow = columnAad(v.tenant_id, v.tabela, v.coluna, "0199c1b4-0000-7000-8000-00000000bbbb");
    expect(() => open(value, hex(v.dek_hex), otherRow)).toThrow(CryptoError);
    const tampered = Buffer.from(value);
    tampered[tampered.length - 1]! ^= 1;
    try {
      open(tampered, hex(v.dek_hex), columnAad(v.tenant_id, v.tabela, v.coluna, v.id));
      expect.unreachable();
    } catch (e) {
      expect((e as CryptoError).code).toBe("CRYPTO_FAILED");
    }
  });

  it("AAD aceita tabela qualificada por schema (health.answer) e tenant vazio (rede)", () => {
    expect(columnAad("", "network.person", "cpf_enc", "0199c1b4-0000-7000-8000-00000000aaaa").toString()).toBe(
      "|network.person|cpf_enc|0199c1b4-0000-7000-8000-00000000aaaa",
    );
    expect(() => columnAad("", "a|b", "c", "0199c1b4-0000-7000-8000-00000000aaaa")).toThrow();
  });
});

describe("Cofre com chaveiro versionado (ADR 0002)", () => {
  const ctx: CofreContext = {
    tenant_id: "0199c1b4-0000-7000-8000-000000000001",
    table: "health.answer",
    column: "value",
    id: "0199c1b4-0000-7000-8000-00000000f001",
  };
  const k1 = "11".repeat(32);
  const k2 = "22".repeat(32);

  it("resposta fictícia: cifra por envelope e abre só no mesmo contexto", async () => {
    const cofre = new MasterKeyCofre(parseKeyring(`k1:${k1}`));
    const { plaintext, wrapped } = await cofre.generateDataKey(ctx);
    expect(wrapped.kekVersion).toBe(1);
    const aad = columnAad(ctx.tenant_id, ctx.table, ctx.column, ctx.id);
    const answer = Buffer.from(JSON.stringify({ alergias: "nenhuma (dado fictício)" }));
    const valueEnc = seal(answer, plaintext, aad);
    plaintext.fill(0);
    expect(valueEnc.includes(Buffer.from("fictício"))).toBe(false);

    const dek = await cofre.unwrapDataKey(wrapped, ctx);
    expect(open(valueEnc, dek, aad).equals(answer)).toBe(true);
    for (const other of [{ ...ctx, tenant_id: "0199c1b4-0000-7000-8000-000000000002" }, { ...ctx, id: "0199c1b4-0000-7000-8000-00000000f002" }, { ...ctx, column: "outra" }]) {
      await expect(cofre.unwrapDataKey(wrapped, other)).rejects.toThrow(CryptoError);
    }
    await expect(cofre.unwrapDataKey({ ...wrapped, kekVersion: 2 }, ctx)).rejects.toThrow(CryptoError);
  });

  it("no Cofre a tabela é sempre schema.tabela (ADR 0002)", async () => {
    const cofre = new MasterKeyCofre(parseKeyring(`k1:${k1}`));
    await expect(cofre.generateDataKey({ ...ctx, table: "answer" })).rejects.toThrow(/schema\.tabela/);
  });

  it("rotação: k2 ativa gera com 2 e ainda abre o que k1 envelopou; sem k1, não abre", async () => {
    const old = await new MasterKeyCofre(parseKeyring(`k1:${k1}`)).generateDataKey(ctx);
    const rotated = new MasterKeyCofre(parseKeyring(`k2:${k2},k1:${k1}`));
    expect((await rotated.generateDataKey(ctx)).wrapped.kekVersion).toBe(2);
    expect(Buffer.from(await rotated.unwrapDataKey(old.wrapped, ctx)).equals(Buffer.from(old.plaintext))).toBe(true);
    await expect(new MasterKeyCofre(parseKeyring(`k2:${k2}`)).unwrapDataKey(old.wrapped, ctx)).rejects.toThrow(CryptoError);
  });

  it("chaveiro malformado ou com a chave de teste do CI em produção é recusado, sem mostrar o valor", () => {
    for (const bad of [undefined, "", "k0:" + k1, "k1:" + k1.slice(2), `k1:${k1},k1:${k2}`, "dev1:" + k1, k1]) {
      expect(() => parseKeyring(bad)).toThrow(/^ATTA_SAUDE_CHAVE_MESTRA (ausente|malformada)$/);
    }
    expect(fingerprint(hex(CI_TEST_KEK_HEX))).toBe(CI_TEST_KEK_FINGERPRINT);
    expect(() => parseKeyring(CI_TEST_KEYRING, new Set([CI_TEST_KEK_FINGERPRINT]))).toThrow(/chave de teste$/);
    expect(parseKeyring(CI_TEST_KEYRING).active).toBe(1);
  });

  it("getCofre separa health e documents: a DEK de um chaveiro não abre no outro", async () => {
    process.env.ATTA_SAUDE_CHAVE_MESTRA = `k1:${k1}`;
    process.env.ATTA_DOCUMENTOS_CHAVE_MESTRA = `k1:${k2}`;
    const pdf: CofreContext = { ...ctx, table: "documents.stored_object", column: "content" };
    const { wrapped } = await getCofre("documents").generateDataKey(pdf);
    await expect(getCofre("documents").unwrapDataKey(wrapped, pdf)).resolves.toHaveLength(32);
    await expect(getCofre("health").unwrapDataKey(wrapped, pdf)).rejects.toThrow(CryptoError);
    process.env.ATTA_REDE_CHAVE_MESTRA = `k1:${"33".repeat(32)}`;
    const person: CofreContext = { tenant_id: "", table: "network.person", column: "cpf_enc", id: ctx.id };
    const net = await getCofre("network").generateDataKey(person);
    await expect(getCofre("network").unwrapDataKey(net.wrapped, person)).resolves.toHaveLength(32);
    for (const other of ["health", "documents"] as const) {
      await expect(getCofre(other).unwrapDataKey(net.wrapped, person)).rejects.toThrow(CryptoError);
    }
    await expect(getCofre("network").unwrapDataKey(wrapped, pdf)).rejects.toThrow(CryptoError);
    delete process.env.ATTA_DOCUMENTOS_CHAVE_MESTRA;
    delete process.env.ATTA_REDE_CHAVE_MESTRA;
  });
});

describe("contato local em pending (MIG-12c do Backend 2)", () => {
  it("AAD é tenant_id|network.person_tenant_link|<coluna>|<local_envelope_id> e o Cofre de rede amarra a DEK a ele", async () => {
    const tenant = "0199c1b4-0000-7000-8000-000000000001";
    const localEnvelopeId = "0199c1b4-0000-7000-8000-00000000e001";
    const aad = columnAad(tenant, "network.person_tenant_link", "local_phone_enc", localEnvelopeId);
    expect(aad.toString("ascii")).toBe(`${tenant}|network.person_tenant_link|local_phone_enc|${localEnvelopeId}`);
    process.env.ATTA_REDE_CHAVE_MESTRA = `k1:${"44".repeat(32)}`;
    const ctx: CofreContext = { tenant_id: tenant, table: "network.person_tenant_link", column: "local_phone_enc", id: localEnvelopeId };
    const { plaintext, wrapped } = await getCofre("network").generateDataKey(ctx);
    const valor = seal(Buffer.from("+5511900000000"), plaintext, aad); // telefone fictício
    const dek = await getCofre("network").unwrapDataKey(wrapped, ctx);
    expect(open(valor, dek, aad).toString()).toBe("+5511900000000");
    // o mesmo cifrado não abre como se fosse da pessoa (owner/granted usam o id da pessoa e a tabela network.person)
    const comoPessoa = columnAad("", "network.person", "phone_enc", localEnvelopeId);
    expect(() => open(valor, dek, comoPessoa)).toThrow(CryptoError);
    delete process.env.ATTA_REDE_CHAVE_MESTRA;
  });
});
