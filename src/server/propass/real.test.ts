import { createHash } from "node:crypto";
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
const envio = vi.hoisted(() => ({ conferirIdentidade: vi.fn(), enviarPropass: vi.fn() }));
vi.mock("./envio", () => envio);
const { portaPropassReal: porta } = await import("./real");

const TENANT = "eeee0000-0000-4000-8000-000000000001";
const HASH = Buffer.alloc(32, 7);
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));

async function linha() {
  const s = await selarConvite({ tenantId: TENANT, email: "bruna.reis@exemplo.test" }, { cofre, hmacDoEmail: () => Buffer.alloc(32, 1) });
  return {
    link_id: "eeee0000-0000-4000-8000-000000000311", tenant_id: TENANT, tenant_name: "Clínica Alfa", tenant_timezone: "America/Manaus", step: "dados",
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
    expect(r).toEqual({ ok: true, data: { clinica: "Clínica Alfa", emailDoConvite: "bruna.reis@exemplo.test", conviteEm: "2026-11-20T19:20:00+00:00", fuso: "America/Manaus" } }); // o fuso da clínica (#265), não um padrão
  });

  it("linha fora do contrato é defeito do servidor (INTERNO), não link vencido; fuso que o Intl não aceita também", async () => {
    const semFuso: Record<string, unknown> = { ...(await linha()) };
    delete semFuso.tenant_timezone;
    for (const data of [[semFuso], [{ ...(await linha()), tenant_id: "não-é-uuid" }], [await linha(), await linha()]]) {
      rpc.mockResolvedValue({ data, error: null });
      const r = await porta.resolver(HASH);
      expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
      expect(JSON.stringify(r)).not.toContain("exemplo.test");
    }
    rpc.mockResolvedValue({ data: [{ ...(await linha()), tenant_timezone: "Lua/Base_Alfa" }], error: null });
    expect(await porta.resolver(HASH)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("nenhuma linha (vazio ou nulo) continua sendo link sem validade", async () => {
    for (const data of [[], null]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await porta.resolver(HASH)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    }
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

describe("portaPropassReal.termo", () => {
  const BODY = "Termo de Autorização de Uso de Imagem de Assinatura Digital\n\nEu, {{profissional.nome}}, inscrita(o) no {{profissional.registro}}, autorizo {{clinica.razao_social}} (CNPJ {{clinica.cnpj}}), estabelecimento \"{{clinica.nome}}\", a:\n\n(i) reproduzir digitalmente a imagem da minha assinatura;";
  const contexto = (extra: Record<string, unknown> = {}) => ({
    legal_name: "Alfa Serviços de Estética Ltda.", trade_name: "Clínica Alfa", cnpj: "11222333000181",
    template_id: "eeee0000-0000-4000-8000-000000000701", version: 1, body_normalization: "nfc-lf",
    body: BODY, body_sha256: createHash("sha256").update(BODY).digest("hex"), ...extra,
  });
  const registro = { conselho: "crm" as const, numero: "990001", uf: "SP", nome: "Bruna Reis" };

  it("preenche no servidor com os valores do pacote e devolve título e parágrafos", async () => {
    rpc.mockResolvedValue({ data: [contexto()], error: null });
    const r = await porta.termo(HASH, registro);
    expect(rpc).toHaveBeenCalledWith("propass_authorization_context", { p_secret_hash: `\\x${HASH.toString("hex")}` });
    expect(r.ok && r.data.titulo).toBe("Termo de Autorização de Uso de Imagem de Assinatura Digital");
    const primeiro = r.ok ? r.data.paragrafos[0]! : "";
    expect(primeiro).toContain("Eu, Bruna Reis, inscrita(o) no CRM-SP 990001, autorizo Alfa Serviços de Estética Ltda.");
    expect(primeiro).toContain('estabelecimento "Clínica Alfa"');
    expect(primeiro).not.toContain("{{");
  });

  it("o CNPJ do pacote pode ser alfanumérico (IN RFB 2.229/2024), sem pontuação e em maiúsculas", async () => {
    const { contextoSchema } = await import("./real");
    for (const cnpj of ["11222333000181", "12ABC34501DE35"]) expect(contextoSchema.safeParse(contexto({ cnpj })).success).toBe(true);
    for (const cnpj of ["12abc34501de35", "12.ABC.345/01DE-35", "12ABC34501DEAB", "1122233300018", "11222333000181X"]) {
      expect(contextoSchema.safeParse(contexto({ cnpj })).success).toBe(false);
    }
  });

  it("pacote do termo fora do contrato é INTERNO; nenhuma linha continua link sem validade", async () => {
    for (const data of [[contexto({ cnpj: 123 })], [contexto({ template_id: "x" })], [contexto(), contexto()]]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await porta.termo(HASH, registro)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    }
    for (const data of [[], null]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await porta.termo(HASH, registro)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    }
  });

  it("corpo que não bate com o hash assinado vira INTERNO, sem montar o termo", async () => {
    rpc.mockResolvedValue({ data: [contexto({ body_sha256: "0".repeat(64) })], error: null });
    expect(await porta.termo(HASH, registro)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("link inválido é NAO_ENCONTRADO; sem razão social (ATTA-IN-0003) volta como erro do banco", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004" } });
    expect(await porta.termo(HASH, registro)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "legal_name" } });
    expect(await porta.termo(HASH, registro)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
  });
});

describe("portaPropassReal: identidade e envio pelo servidor do Backend 4 (#247)", () => {
  const ORIGEM = { ip: "203.0.113.7", userAgent: "Navegador de teste" };
  it("identidade devolve só 'pedir_pin' ou 'usar_pin_existente'", async () => {
    envio.conferirIdentidade.mockResolvedValue({ ok: true, data: { status: "usar_pin_existente" } });
    const registro = { conselho: "crm" as const, uf: "SP", numero: "990001", cpf: "52998224725" };
    expect(await porta.identidade(HASH, registro, ORIGEM)).toEqual({ ok: true, data: "usar_pin_existente" });
    expect(envio.conferirIdentidade).toHaveBeenCalledWith(HASH, registro, ORIGEM);
  });

  it("enviar repassa dados, PNG, PIN, leitura, origem e o Aviso ao enviarPropass e devolve o status e o Código ATTA", async () => {
    envio.enviarPropass.mockResolvedValue({ ok: true, data: { status: "ok", codigoAtta: "ATTA-7K3M-Q9PX-2HDV" } });
    const pedido = {
      dados: { nome: "Bruna Reis", cpf: "52998224725", whatsapp: "11987654321", conselho: "crm" as const, numero: "990001", uf: "SP" },
      assinaturaPng: Buffer.from([137, 80, 78, 71]), pin: null,
      leitura: { abertoEm: new Date("2026-11-21T10:00:00Z"), rolagemCompletaEm: new Date("2026-11-21T10:01:00Z") }, origem: ORIGEM, avisoDePrivacidade: null,
    };
    expect(await porta.enviar(HASH, pedido)).toEqual({ ok: true, data: { status: "ok", codigoAtta: "ATTA-7K3M-Q9PX-2HDV" } });
    expect(envio.enviarPropass).toHaveBeenCalledWith(HASH, pedido);
    envio.enviarPropass.mockResolvedValue({ ok: true, data: { status: "recusado" } });
    expect(await porta.enviar(HASH, pedido)).toEqual({ ok: true, data: { status: "recusado" } }); // recusa sem código
    envio.enviarPropass.mockResolvedValue({ ok: false, error: { code: "LIMITE", message: "x" } });
    expect(await porta.enviar(HASH, pedido)).toMatchObject({ ok: false, error: { code: "LIMITE" } });
  });
});
