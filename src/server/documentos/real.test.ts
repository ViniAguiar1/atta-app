import { beforeEach, describe, expect, it, vi } from "vitest";

// Porta real com o cliente do Supabase simulado: confere as duas funções chamadas (lista e resumo, #69 e #148), o Zod
// da borda, o descarte de ação desconhecida, o percentual com ATTA Sign e o falhaDoBanco. Dado fictício.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => ({ schema: () => ({ rpc }) }) }));
const { portaDocumentosReal: porta } = await import("./real");

const SERVICO = { id: "cccc0000-0000-4000-8000-000000000001", name: "Toxina botulínica" };
const LINHA = {
  id: "dddd0000-0000-4000-8000-000000000002", kind: "personalizado", title: "Cuidados pós-procedimento", status: "ativo",
  current_version: 3, frequency: "unica", validity_months: 6, required: true, clinic_service_ids: [SERVICO.id],
  updated_at: "2026-11-20T12:00:00+00:00",
  allowed_actions: [{ action: "editar" }, { action: "publicar", disabled_reason: "service_ids" }, { action: "duplicar" }],
  clinic_services: [SERVICO], current_version_published_at: "2026-08-11T13:00:00+00:00", signed_count: 12,
};
const RESUMO = {
  active_count: 7, active_required_count: 6, active_optional_count: 1, expiring_count: null, expired_count: null,
  signed_count: 40, signed_atta_sign_count: 40,
};

function responder(lista: unknown, resumo: unknown = { data: [RESUMO], error: null }) {
  rpc.mockImplementation(async (nome: string) => (nome === "atta_in_template_list" ? lista : resumo));
}

beforeEach(() => rpc.mockReset());

describe("portaDocumentosReal.listar", () => {
  it("chama a lista e o resumo e devolve a tela pronta, só com ações conhecidas", async () => {
    responder({ data: [LINHA], error: null });
    const r = await porta.listar();
    expect(rpc).toHaveBeenCalledWith("atta_in_template_list");
    expect(rpc).toHaveBeenCalledWith("atta_in_template_summary");
    expect(r).toEqual({
      ok: true,
      data: {
        modelos: [{
          id: LINHA.id, tipo: "personalizado", titulo: "Cuidados pós-procedimento", estado: "ativo", versaoAtual: 3,
          frequencia: "unica", validadeMeses: 6, obrigatorio: true, procedimentos: [{ id: SERVICO.id, nome: "Toxina botulínica" }],
          publicadoEm: LINHA.current_version_published_at, assinados: 12, atualizadoEm: LINHA.updated_at,
          acoes: [{ acao: "editar", motivoDesabilitado: null }, { acao: "publicar", motivoDesabilitado: "service_ids" }],
        }],
        resumo: { ativos: 7, obrigatorios: 6, opcionais: 1, vencendo: null, vencidos: null, assinados: 40, percentualAttaSign: 100 },
      },
    });
  });

  it("sem documento assinado, o percentual é \"—\" (null), nunca 0 inventado", async () => {
    responder({ data: [], error: null }, { data: [{ ...RESUMO, active_count: 0, active_required_count: 0, active_optional_count: 0, signed_count: 0, signed_atta_sign_count: 0 }], error: null });
    const r = await porta.listar();
    expect(r.ok && r.data).toEqual({
      modelos: [],
      resumo: { ativos: 0, obrigatorios: 0, opcionais: 0, vencendo: null, vencidos: null, assinados: 0, percentualAttaSign: null },
    });
  });

  it("sem documents.view vira SEM_PERMISSAO; lista ou resumo fora do formato vira INTERNO", async () => {
    responder({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004" } });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO" } });
    responder({ data: [{ ...LINHA, kind: "outro" }], error: null });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    responder({ data: [LINHA], error: null }, { data: [], error: null });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });
});
