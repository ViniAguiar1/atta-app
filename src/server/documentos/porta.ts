import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaDocumentosReal } from "./real";

// Contrato entre a aba Termos & Docs › Modelos de documento (MIG-44, Frontend 6) e os modelos do Backend 6 (MIG-20,
// #69): api.atta_in_template_list, atta_in_template_publish, template_set_services e template_deactivate.
// PDD v206 §10.3 / §10.3.1 (Meus modelos; Rascunho → Ativo → Inativo) e §17.2 (tipos, frequência, validade).
// A tela usa a real em todo ambiente: cliente de servidor com a sessão do usuário (nunca a secret key); tenant e
// permissão (has_permission('documents', …)) são conferidos no banco. Sem modelo, a lista vem vazia de verdade e a
// tela mostra o estado vazio do design. A simulada (simulado.ts) é só para os testes da tela.

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
  servicos: string[]; // ids dos Serviços vivos vinculados (§10.4.7)
  atualizadoEm: string; // ISO 8601
  acoes: AcaoDeModelo[];
};

export type PortaDocumentos = {
  /** Meus modelos, com os inativos por último (ordem do servidor). SEM_PERMISSAO: sem documents.view. */
  listar(): Promise<Resultado<ModeloDeDocumento[]>>;
};

export const portaDocumentos: PortaDocumentos = portaDocumentosReal;
