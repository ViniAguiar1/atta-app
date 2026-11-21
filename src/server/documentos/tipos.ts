// Tipos e constantes da lista de modelos (contrato da PortaDocumentos), sem dependência de implementação: real.ts e
// simulado.ts importam daqui, e porta.ts reexporta (sem import circular).

/** Tipos do §17.2 que a clínica cria, mais o Termo de Autorização do profissional (§10.4.3). */
export const TIPOS_DE_MODELO = [
  "tcle", "consentimento_procedimento", "autorizacao_uso_imagem", "termo_responsabilidade_cuidados",
  "contrato_prestacao_servicos", "politica_cancelamento_no_show", "personalizado", "termo_de_autorizacao",
] as const;
export type TipoDeModelo = (typeof TIPOS_DE_MODELO)[number];

export const ESTADOS_DE_MODELO = ["rascunho", "ativo", "inativo"] as const;
export type EstadoDeModelo = (typeof ESTADOS_DE_MODELO)[number];

/** Ações por linha, decididas no servidor (ADR 0001 §5): a tela mostra o que vier e não refaz a regra. */
export const ACOES_DE_MODELO = ["editar", "vincular_procedimentos", "publicar", "inativar"] as const;
export type AcaoDeModelo = { acao: (typeof ACOES_DE_MODELO)[number]; motivoDesabilitado: string | null };

export type ModeloDeDocumento = {
  id: string;
  tipo: TipoDeModelo;
  titulo: string;
  estado: EstadoDeModelo;
  versaoAtual: number | null; // null enquanto Rascunho (nunca publicado)
  frequencia: "por_procedimento" | "unica" | null;
  validadeMeses: 3 | 6 | 12 | null; // RN-V-01: só na "Única"; null = indeterminada
  obrigatorio: boolean | null; // RN-DOC-04, sem valor padrão: null até a clínica escolher
  procedimentos: { id: string; nome: string }[]; // Serviços vivos vinculados (§10.4.7), por nome
  publicadoEm: string | null; // ISO 8601 da versão atual; null em Rascunho
  assinados: number; // documentos do modelo em Assinado definitivo ou Substituído (#148)
  atualizadoEm: string; // ISO 8601
  acoes: AcaoDeModelo[];
};

/** Cartões do topo (simulador, captura 39). Número que não existe vem null, e a tela mostra "—". */
export type ResumoDosModelos = {
  ativos: number | null;
  obrigatorios: number | null;
  opcionais: number | null;
  vencendo: number | null;
  vencidos: number | null;
  assinados: number | null;
  percentualAttaSign: number | null;
};

export type MeusModelos = { modelos: ModeloDeDocumento[]; resumo: ResumoDosModelos };


/** Serviço da clínica para o "vincular procedimentos" (§10.4.7). Inativo aparece marcado: o vínculo aceita qualquer
 * Serviço não excluído (#69). */
export type ServicoParaVincular = { id: string; nome: string; ativo: boolean };
