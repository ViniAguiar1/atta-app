import { describe, expect, it, vi } from "vitest";
import { conferirIdentidade, enviarPropass, type DependenciasDoEnvio, type EntradaDoEnvio } from "./envio";

// Banco simulado: cada rpc responde pelo nome; os testes conferem a ordem e o que foi mandado. Dados fictícios.
const HASH = Buffer.alloc(32, 7);
const TENANT = "00000000-0000-4000-8000-00000000000a";
const LINK = "00000000-0000-4000-8000-0000000000c1";
const PROF_EXISTENTE = "00000000-0000-4000-8000-0000000000f1";
const NOVO = "00000000-0000-4000-8000-0000000000f9";

type Resposta = { data: unknown; error: { code?: string; message?: string; details?: string } | null };
function banco(sobrescrever: Record<string, Resposta> = {}) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const padrao: Record<string, Resposta> = {
    propass_resolve: { data: [{ link_id: LINK, tenant_id: TENANT, invite_email_enc: "\\x01", invite_envelope_id: "e", invite_dek_wrapped: "\\x02", invite_kek_version: 1 }], error: null },
    propass_authorization_context: { data: [{ legal_name: "Clínica Fictícia Ltda", trade_name: "Clínica Fictícia", cnpj: "12345678000195", template_id: "00000000-0000-4000-8000-0000000000d1", version: 1, body_sha256: "a".repeat(64), body_normalization: "nfc-lf", body: "x" }], error: null },
    propass_identity_check: { data: { status: "pedir_pin", professional_id: null }, error: null },
    propass_submit: { data: "ok", error: null },
  };
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    chamadas.push({ fn, args });
    return sobrescrever[fn] ?? padrao[fn] ?? { data: null, error: { code: "P0001", message: "?" } };
  });
  return { rpc, chamadas };
}

const entrada = (pin = "4071"): EntradaDoEnvio => ({
  dados: { nome: " Dra. Fictícia ", cpf: "529.982.247-25", whatsapp: "11990010001", conselho: "cro", numero: "12345", uf: "SP" },
  assinaturaPng: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pin,
  leitura: { abertoEm: new Date("2026-11-21T10:00:00Z"), rolagemCompletaEm: new Date("2026-11-21T10:01:00Z") },
  origem: { ip: "203.0.113.7", userAgent: "teste" },
});

function deps(rpc: DependenciasDoEnvio["rpc"], extra: Partial<DependenciasDoEnvio> = {}) {
  const selar = vi.fn(async (e: { professionalId?: string }) => ({
    professional_id: e.professionalId!, cpf_hmac: "\\xaa", cpf_masked: "···.···.247-25", cpf_enc: "\\x01", phone_enc: "\\x02",
    email_hmac: "\\xbb", email_enc: "\\x03", dek_wrapped: "\\x04", kek_version: 1,
  }));
  const macDoPin = vi.fn((id: string) => Buffer.from(id.replace(/-/g, "").padEnd(64, "0").slice(0, 64), "hex"));
  const assinar = vi.fn(async (_dados: unknown) => ({
    p_document_id: "00000000-0000-4000-8000-0000000000e1", p_payload_canonical: "\\x7b7d", p_atta_code: "ATTA-0000-0000-0000",
    p_seal_kid: "seal-2026-11", p_seal: "\\x00", p_stroke: { storage_path: "a/b/assinatura.png", sha256_plain: "a".repeat(64), size_bytes: 8, dek_wrapped: "ab", kek_version: 1 },
  }));
  const d: DependenciasDoEnvio = {
    rpc,
    limite: vi.fn(async () => ({ ok: true as const, data: null })),
    abrir: vi.fn(async () => "dra@exemplo.test"),
    conselho: { conferir: vi.fn(async () => ({ situacao: "nao_consultado" as const })) },
    selar: selar as unknown as DependenciasDoEnvio["selar"],
    hmacDoCpf: () => Buffer.alloc(32, 1),
    macDoPin,
    assinar,
    novoId: () => NOVO,
    ...extra,
  };
  return { d, selar, macDoPin, assinar };
}

describe("enviarPropass (envio final do PROpass)", () => {
  it("na ordem: convite, contexto, identidade e submit; dados cifrados, pin_mac e pacote do termo num envio só", async () => {
    const { rpc, chamadas } = banco();
    const { d, selar, macDoPin, assinar } = deps(rpc);
    expect(await enviarPropass(HASH, entrada(), d)).toEqual({ ok: true, data: { status: "ok", codigoAtta: "ATTA-0000-0000-0000" } });
    expect(chamadas.map((c) => c.fn)).toEqual(["propass_resolve", "propass_authorization_context", "propass_identity_check", "propass_submit"]);
    expect(selar.mock.calls[0]![0]).toMatchObject({ email: "dra@exemplo.test", professionalId: NOVO });
    expect(macDoPin).toHaveBeenCalledWith(NOVO, "4071");
    expect(assinar.mock.calls[0]![0]).toMatchObject({
      tenantId: TENANT, vinculoId: LINK,
      clinica: { razaoSocial: "Clínica Fictícia Ltda", nomeFantasia: "Clínica Fictícia", cnpj: "12345678000195" },
      profissional: { nome: "Dra. Fictícia", conselho: "cro", uf: "SP", numero: "12345" },
    });
    const sub = chamadas[3]!.args;
    expect(sub).toMatchObject({ p_professional_id: NOVO, p_council_status: "nao_consultado", p_pin_mac_version: 1, p_seal_kid: "seal-2026-11", p_display_name: "Dra. Fictícia" });
    expect(String(sub.p_pin_mac)).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(JSON.stringify(sub)).not.toContain("4071");   // o PIN cru nunca vai ao banco
    expect(JSON.stringify(sub)).not.toContain("52998224725");
  });

  it("profissional que já existe sem PIN: o pin_mac usa o id dele, que só o banco conhece", async () => {
    const { rpc } = banco({ propass_identity_check: { data: { status: "pedir_pin", professional_id: PROF_EXISTENTE }, error: null } });
    const { d, macDoPin, selar } = deps(rpc);
    await enviarPropass(HASH, entrada(), d);
    expect(macDoPin).toHaveBeenCalledWith(PROF_EXISTENTE, "4071");
    expect(selar.mock.calls[0]![0]).toMatchObject({ professionalId: PROF_EXISTENTE });
  });

  it("quem já tem PIN (usar_pin_existente) envia sem PIN: o submit vai com o mac e a versão nulos", async () => {
    const { rpc, chamadas } = banco({ propass_identity_check: { data: { status: "usar_pin_existente" }, error: null } });
    const { d, macDoPin } = deps(rpc);
    expect(await enviarPropass(HASH, { ...entrada(), pin: null }, d)).toEqual({ ok: true, data: { status: "ok", codigoAtta: "ATTA-0000-0000-0000" } });
    expect(macDoPin).not.toHaveBeenCalled();
    expect(chamadas.at(-1)!.args).toMatchObject({ p_pin_mac: null, p_pin_mac_version: null });
  });

  it("PIN junto de usar_pin_existente, ou falta de PIN com pedir_pin: VALIDACAO no pin, sem submit", async () => {
    const com = banco({ propass_identity_check: { data: { status: "usar_pin_existente" }, error: null } });
    const r1 = await enviarPropass(HASH, entrada(), deps(com.rpc).d);
    expect(r1).toMatchObject({ ok: false, error: { code: "VALIDACAO", reason: "ATTA-IN-0001:pin_existente" } });
    expect(com.chamadas.map((c) => c.fn)).not.toContain("propass_submit");
    const sem = banco();
    const r2 = await enviarPropass(HASH, { ...entrada(), pin: null }, deps(sem.rpc).d);
    expect(r2).toMatchObject({ ok: false, error: { code: "VALIDACAO", reason: "ATTA-IN-0001:pin_obrigatorio" } });
    expect(sem.chamadas.map((c) => c.fn)).not.toContain("propass_submit");
  });

  it("resposta do passo 2 fora do contrato (id que não é uuid) não chega ao pin_mac: INTERNO", async () => {
    const { rpc, chamadas } = banco({ propass_identity_check: { data: { status: "pedir_pin", professional_id: "nao-e-uuid" }, error: null } });
    const { d, macDoPin } = deps(rpc);
    expect(await enviarPropass(HASH, entrada(), d)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(macDoPin).not.toHaveBeenCalled();
    expect(chamadas.map((c) => c.fn)).not.toContain("propass_submit");
  });

  it("PIN óbvio ou fora do formato: VALIDACAO sem tocar no banco", async () => {
    for (const pin of ["1234", "0000", "12a4"]) {
      const { rpc } = banco();
      const r = await enviarPropass(HASH, entrada(pin), deps(rpc).d);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatchObject({ code: "VALIDACAO", fields: [{ campo: "pin", code: "VALIDACAO" }] });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("nome com marcador de modelo ({{ ou }}): campo inválido, sem tocar no banco", async () => {
    for (const nome of ["Dra. {{clinica.nome}}", "Dra. }} Fictícia"]) {
      const { rpc } = banco();
      const e = entrada();
      const r = await enviarPropass(HASH, { ...e, dados: { ...e.dados, nome } }, deps(rpc).d);
      expect(r).toMatchObject({ ok: false, error: { code: "VALIDACAO", fields: [{ campo: "nome", code: "VALIDACAO" }] } });
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("limite por IP estourado: LIMITE antes de qualquer outra coisa", async () => {
    const { rpc } = banco();
    const r = await enviarPropass(HASH, entrada(), deps(rpc, { limite: async () => ({ ok: false, error: { code: "LIMITE", message: "x" } }) }).d);
    expect(r).toMatchObject({ ok: false, error: { code: "LIMITE" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("conselho que não confere: não chama a identidade nem o submit", async () => {
    const { rpc, chamadas } = banco();
    const { d, assinar } = deps(rpc, { conselho: { conferir: async () => ({ situacao: "nao_confere" }) } });
    const r = await enviarPropass(HASH, entrada(), d);
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0003:council" } });
    expect(chamadas.map((c) => c.fn)).not.toContain("propass_submit");
    expect(assinar).not.toHaveBeenCalled();
  });

  it("link vencido, revogado ou desconhecido: NAO_ENCONTRADO, a mesma resposta", async () => {
    const { rpc } = banco({ propass_resolve: { data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: "grant" } } });
    expect(await enviarPropass(HASH, entrada(), deps(rpc).d)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
  });

  it("clínica sem razão social ou CNPJ: nada é montado nem assinado (decisão do CTO)", async () => {
    const { rpc, chamadas } = banco({ propass_authorization_context: { data: [{ legal_name: null, trade_name: "Clínica", cnpj: null }], error: null } });
    const { d, assinar } = deps(rpc);
    expect(await enviarPropass(HASH, entrada(), d)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
    expect(assinar).not.toHaveBeenCalled();
    expect(chamadas.map((c) => c.fn)).not.toContain("propass_submit");
  });

  it("recusa de identidade no submit volta como 'recusado'", async () => {
    const { rpc } = banco({ propass_submit: { data: "recusado", error: null } });
    expect(await enviarPropass(HASH, entrada(), deps(rpc).d)).toEqual({ ok: true, data: { status: "recusado" } });
  });
});

describe("conferirIdentidade (passo 2)", () => {
  it("devolve só o status, nunca o id do profissional", async () => {
    const { rpc } = banco({ propass_identity_check: { data: { status: "pedir_pin", professional_id: PROF_EXISTENTE }, error: null } });
    const r = await conferirIdentidade(HASH, { conselho: "cro", uf: "SP", numero: "12345", cpf: "52998224725" }, { ip: "203.0.113.7", userAgent: null }, deps(rpc).d);
    expect(r).toEqual({ ok: true, data: { status: "pedir_pin" } });
  });

  it("limite por link do banco (54000) vira LIMITE", async () => {
    const { rpc } = banco({ propass_identity_check: { data: null, error: { code: "54000", message: "ATTA-IN-0003", details: "rate_limit" } } });
    const r = await conferirIdentidade(HASH, { conselho: "cro", uf: "SP", numero: "12345", cpf: "52998224725" }, { ip: "203.0.113.7", userAgent: null }, deps(rpc).d);
    expect(r).toMatchObject({ ok: false, error: { code: "LIMITE" } });
  });

  it("limite por IP vale também no passo 2", async () => {
    const { rpc } = banco();
    const r = await conferirIdentidade(HASH, { conselho: "cro", uf: "SP", numero: "12345", cpf: "52998224725" }, { ip: null, userAgent: null },
      deps(rpc, { limite: async () => ({ ok: false, error: { code: "LIMITE", message: "x" } }) }).d);
    expect(r).toMatchObject({ ok: false, error: { code: "LIMITE" } });
    expect(rpc).not.toHaveBeenCalled();
  });
});
