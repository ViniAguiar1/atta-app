import "server-only";
import { ok } from "@/lib/errors";
import type { ModeloDeDocumento, PortaDocumentos } from "./porta";

// Modelos fictícios para os testes da tela (a tela usa a real em todo ambiente). Um de cada estado, cobrindo o
// "publicar" desabilitado sem procedimento vivo (disabled_reason 'service_ids', #69).
export const MODELOS_SIMULADOS: ModeloDeDocumento[] = [
  {
    id: "dddd0000-0000-4000-8000-000000000001", tipo: "tcle", titulo: "TCLE — Toxina botulínica", estado: "ativo", versaoAtual: 2,
    frequencia: "por_procedimento", validadeMeses: null, obrigatorio: true, servicos: ["cccc0000-0000-4000-8000-000000000001"],
    atualizadoEm: "2026-11-18T14:10:00.000Z", acoes: [{ acao: "editar", motivoDesabilitado: null }, { acao: "vincular_procedimentos", motivoDesabilitado: null }, { acao: "publicar", motivoDesabilitado: null }, { acao: "inativar", motivoDesabilitado: null }],
  },
  {
    id: "dddd0000-0000-4000-8000-000000000002", tipo: "politica_cancelamento_no_show", titulo: "Política de cancelamento", estado: "rascunho", versaoAtual: null,
    frequencia: "unica", validadeMeses: 12, obrigatorio: null, servicos: [],
    atualizadoEm: "2026-11-20T09:00:00.000Z", acoes: [{ acao: "editar", motivoDesabilitado: null }, { acao: "vincular_procedimentos", motivoDesabilitado: null }, { acao: "publicar", motivoDesabilitado: "service_ids" }],
  },
  {
    id: "dddd0000-0000-4000-8000-000000000003", tipo: "autorizacao_uso_imagem", titulo: "Uso de imagem (2025)", estado: "inativo", versaoAtual: 1,
    frequencia: "por_procedimento", validadeMeses: null, obrigatorio: false, servicos: [],
    atualizadoEm: "2026-10-02T11:30:00.000Z", acoes: [],
  },
];

export const portaDocumentosSimulada: PortaDocumentos = {
  async listar() {
    return ok(MODELOS_SIMULADOS);
  },
};
