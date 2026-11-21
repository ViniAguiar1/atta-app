import { beforeEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { selarConvite } from "./convite";

// Porta real do PROpass com o cliente admin simulado: o hash vai ao banco (nunca o segredo), o e-mail do convite abre
// no servidor pela KEK de teste, e link sem validade dá a mesma resposta. Dado fictício.
vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
vi.stubEnv("ATTA_EMAIL_PEPPER", "11".repeat(32));

const rpc = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: () => ({ schema: () => ({ rpc }) }) }));
const { portaPropassReal: porta } = await import("./real");

const TENANT = "eeee0000-0000-4000-8000-000000000001";
const HASH = Buffer.alloc(32, 7);
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));

async function linha() {
  const s = await selarConvite({ tenantId: TENANT, email: "bruna.reis@exemplo.test" }, { cofre, hmacDoEmail: () => Buffer.alloc(32, 1) });
  return {
    link_id: "eeee0000-0000-4000-8000-000000000311", tenant_id: TENANT, tenant_name: "Clínica Alfa", step: "dados",
    invited_at: "2026-11-20T19:20:00+00:00", expires_at: "2026-11-27T19:20:00+00:00",
    invite_email_enc: s.invite_email_enc, invite_envelope_id: s.envelope_id, invite_dek_wrapped: s.dek_wrapped, invite_kek_version: s.kek_version,
  };
}

beforeEach(() => rpc.mockReset());

describe("portaPropassReal", () => {
  it("resolver: manda só o hash ao banco e abre o e-mail do convite no servidor", async () => {
    rpc.mockResolvedValue({ data: [await linha()], error: null });
    const r = await porta.resolver(HASH);
    expect(rpc).toHaveBeenCalledWith("propass_resolve", { p_secret_hash: `\\x${HASH.toString("hex")}` });
    expect(r).toEqual({ ok: true, data: { clinica: "Clínica Alfa", emailDoConvite: "bruna.reis@exemplo.test", conviteEm: "2026-11-20T19:20:00+00:00", fuso: "America/Sao_Paulo" } });
  });

  it("link sem validade (sem linha ou ATTA-AUTH-0004) dá a mesma resposta", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await porta.resolver(HASH)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004" } });
    expect(await porta.resolver(HASH)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
  });

  it("envelope que não abre vira INTERNO, sem o e-mail no erro", async () => {
    rpc.mockResolvedValue({ data: [{ ...(await linha()), invite_email_enc: "\\x00" }], error: null });
    const r = await porta.resolver(HASH);
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(JSON.stringify(r)).not.toContain("exemplo.test");
  });

  it("conselho: só com o link válido, e sem consulta real responde nao_consultado (R20)", async () => {
    const registro = { conselho: "crm" as const, numero: "990001", uf: "SP", nome: "Bruna Reis" };
    rpc.mockResolvedValue({ data: [await linha()], error: null });
    expect(await porta.conferirConselho(HASH, registro)).toEqual({ ok: true, data: { situacao: "nao_consultado" } });
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await porta.conferirConselho(HASH, registro)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
  });
});
