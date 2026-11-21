import { beforeEach, describe, expect, it, vi } from "vitest";

// Porta real de Notificações com o cliente do Supabase e o selarEndereco simulados: confere o que vai a cada RPC do
// MIG-15, que o formato é recusado antes de cifrar (ATTA-IN-0001:address), que o endereço nunca vai em claro e que a
// leitura passa pelo Zod.
const TENANT = "eeee0000-0000-4000-8000-000000000001";
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { tenant_id: TENANT } } }) },
    schema: () => ({ rpc }),
  }),
}));
const selar = vi.fn();
vi.mock("@/server/notificacoes/canal", async (original) => ({
  ...(await original<typeof import("@/server/notificacoes/canal")>()),
  selarEndereco: (...args: unknown[]) => selar(...args),
}));

const { portaAlertasReal: porta } = await import("./real");

const EVENTOS = [
  ["checkin_iniciado", "checkin_atendimentos"],
  ["checkin_concluido", "checkin_atendimentos"],
  ["documento_assinado", "checkin_atendimentos"],
  ["paciente_atrasado", "checkin_atendimentos"],
  ["atendimento_sem_documento", "checkin_atendimentos"],
  ["novo_modelo", "documentos_modelos"],
  ["documento_vencendo", "documentos_modelos"],
  ["documentos_procedimento_atualizados", "documentos_modelos"],
  ["membro_convidado", "sistema_conta"],
  ["limite_documentos_90", "sistema_conta"],
] as const;
const leitura = (whatsappAtivo = false) => ({
  channels: { email: { active: true, masked: "re•••@cl•••.com.br" }, whatsapp: { active: whatsappAtivo, masked: null } },
  events: EVENTOS.map(([key, category]) => ({ key, category, email: key === "checkin_concluido", whatsapp: false })),
  filters: { pausa_noturna: false, frequencia_resumo: "tempo_real" },
});
const SELADO = { p_address_enc: "\\x00", p_address_masked: "(11) •••••-••01", p_envelope_id: "e", p_dek_wrapped: "\\x01", p_kek_version: 1 };

beforeEach(() => {
  rpc.mockReset();
  selar.mockReset().mockResolvedValue(SELADO);
  rpc.mockImplementation(async (fn: string) => (fn === "notification_settings_get" ? { data: leitura(), error: null } : { data: null, error: null }));
});

describe("portaAlertasReal", () => {
  it("lê pelo notification_settings_get e devolve só o mascarado, com os 10 eventos", async () => {
    const r = await porta.ler();
    expect(r.ok && r.data?.email).toEqual({ ativo: true, destinoMascarado: "re•••@cl•••.com.br" });
    expect(r.ok && r.data?.eventos).toHaveLength(10);
    expect(r.ok && r.data?.emPausaNoturna).toBeNull();
  });

  it("resposta fora do contrato vira INTERNO, sem quebrar a tela", async () => {
    rpc.mockResolvedValueOnce({ data: { channels: {} }, error: null });
    const r = await porta.ler();
    expect(!r.ok && r.error.code).toBe("INTERNO");
  });

  it("formato inválido é recusado antes de cifrar (ATTA-IN-0001:address) e nada vai ao banco", async () => {
    const r = await porta.alterarCanal("whatsapp", "1234", true);
    expect(!r.ok && r.error.reason).toBe("ATTA-IN-0001:address");
    expect(selar).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("notification_channel_set", expect.anything());
  });

  it("destino + ligar vão numa chamada, só com o envelope e a máscara (nunca em claro)", async () => {
    await porta.alterarCanal("whatsapp", "(11) 98765-0101", true);
    expect(selar).toHaveBeenCalledWith({ tenantId: TENANT, canal: "whatsapp", endereco: "11987650101" });
    const [, args] = rpc.mock.calls.find(([fn]) => fn === "notification_channel_set")!;
    expect(args).toEqual({ p_channel: "whatsapp", p_active: true, ...SELADO });
    expect(JSON.stringify(args)).not.toContain("98765");
  });

  it("sem ligar junto, o canal mantém o estado atual (desligado: o banco decide a recusa estado)", async () => {
    await porta.alterarCanal("whatsapp", "(11) 98765-0101");
    const [, args] = rpc.mock.calls.find(([fn]) => fn === "notification_channel_set")!;
    expect(args.p_active).toBe(false);
  });

  it("evento e filtros vão às RPCs com os nomes do contrato; erro do banco vira Resultado com o reason", async () => {
    await porta.marcarEvento("novo_modelo", "email", true);
    expect(rpc).toHaveBeenCalledWith("notification_event_set", { p_event_key: "novo_modelo", p_channel: "email", p_enabled: true });
    await porta.salvarFiltros({ pausaNoturna: true, frequenciaDoResumo: "semanal" });
    expect(rpc).toHaveBeenCalledWith("notification_filters_set", { p_pausa_noturna: true, p_frequencia_resumo: "semanal" });
    rpc.mockImplementation(async () => ({ data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "address" } }));
    const r = await porta.ligarCanal("whatsapp", true);
    expect(!r.ok && r.error.reason).toBe("ATTA-IN-0003:address");
  });
});
