import { beforeEach, describe, expect, it, vi } from "vitest";

// Porta real com o cliente do Supabase simulado: confere a função chamada, o Zod da borda, o descarte de ação
// desconhecida e o falhaDoBanco. Dado fictício.
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: async () => ({ schema: () => ({ rpc }) }) }));
const { portaDocumentosReal: porta } = await import("./real");

const LINHA = {
  id: "dddd0000-0000-4000-8000-000000000002", kind: "personalizado", title: "Cuidados pós-procedimento", status: "rascunho",
  current_version: null, frequency: "unica", validity_months: 6, required: null, clinic_service_ids: [],
  updated_at: "2026-11-20T12:00:00+00:00",
  allowed_actions: [{ action: "editar" }, { action: "publicar", disabled_reason: "service_ids" }, { action: "duplicar" }],
};

beforeEach(() => rpc.mockReset());

describe("portaDocumentosReal.listar", () => {
  it("chama api.atta_in_template_list e devolve as linhas de tela, só com ações conhecidas", async () => {
    rpc.mockResolvedValue({ data: [LINHA], error: null });
    const r = await porta.listar();
    expect(rpc).toHaveBeenCalledWith("atta_in_template_list");
    expect(r).toMatchObject({
      ok: true,
      data: {
        modelos: [{
          id: LINHA.id, tipo: "personalizado", titulo: "Cuidados pós-procedimento", estado: "rascunho", versaoAtual: null,
          frequencia: "unica", validadeMeses: 6, obrigatorio: null, procedimentos: [], publicadoEm: null, assinados: null,
          atualizadoEm: LINHA.updated_at,
          acoes: [{ acao: "editar", motivoDesabilitado: null }, { acao: "publicar", motivoDesabilitado: "service_ids" }],
        }],
      },
    });
  });

  it("lista vazia é vazia de verdade (estado vazio do design)", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await porta.listar()).toEqual({
      ok: true,
      data: { modelos: [], resumo: { ativos: 0, obrigatorios: 0, opcionais: 0, vencendo: null, vencidos: null, assinados: null, percentualAttaSign: null } },
    });
  });

  it("sem documents.view vira SEM_PERMISSAO; resposta fora do formato vira INTERNO", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004" } });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO" } });
    rpc.mockResolvedValue({ data: [{ ...LINHA, kind: "outro" }], error: null });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("o resumo conta só os ativos, e o que não tem fonte fica null (nunca 0 inventado)", async () => {
    const ativo = (required: boolean | null, id: string) => ({ ...LINHA, id, status: "ativo", current_version: 1, required });
    rpc.mockResolvedValue({ data: [ativo(true, "dddd0000-0000-4000-8000-00000000000a"), ativo(false, "dddd0000-0000-4000-8000-00000000000b"), LINHA], error: null });
    const r = await porta.listar();
    expect(r.ok && r.data.resumo).toEqual({ ativos: 2, obrigatorios: 1, opcionais: 1, vencendo: null, vencidos: null, assinados: null, percentualAttaSign: null });
  });
});
