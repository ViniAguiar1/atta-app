import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaDocumentosReal } from "./real";

// Contrato entre a aba Termos & Docs › Modelos de documento (MIG-44, Frontend 6) e os modelos do Backend 6 (MIG-20,
// #69): api.atta_in_template_list, atta_in_template_publish, template_set_services e template_deactivate.
// PDD v206 §10.3 / §10.3.1 (Meus modelos; Rascunho → Ativo → Inativo) e §17.2 (tipos, frequência, validade).
// A tela usa a real em todo ambiente: cliente de servidor com a sessão do usuário (nunca a secret key); tenant e
// permissão (has_permission('documents', …)) são conferidos no banco. Sem modelo, a lista vem vazia de verdade e a
// tela mostra o estado vazio do design. A simulada (simulado.ts) é só para os testes da tela.

export * from "./tipos";
import type { MeusModelos, ServicoParaVincular } from "./tipos";

export type PortaDocumentos = {
  /** Meus modelos, com os inativos por último (ordem do servidor), e o resumo. SEM_PERMISSAO: sem documents.view. */
  listar(): Promise<Resultado<MeusModelos>>;
  /** `api.atta_in_template_publish`: nova versão (Rascunho → Ativo, ou Ativo com versão nova). VALIDACAO com o campo
   * (draft_body, frequency, required, service_ids); CONFLITO: Inativo ou sem mudança desde a última versão. */
  publicar(modeloId: string): Promise<Resultado<{ versao: number }>>;
  /** `api.template_deactivate`: Ativo → Inativo. Não volta a Ativo (lacuna com a PO). */
  inativar(modeloId: string): Promise<Resultado<void>>;
  /** `api.template_set_services`: troca o conjunto inteiro de procedimentos vinculados. */
  vincular(modeloId: string, servicoIds: string[]): Promise<Resultado<void>>;
  /** Serviços não excluídos da clínica, por nome (atta_in.clinic_service na sessão, RLS do #33). */
  servicos(): Promise<Resultado<ServicoParaVincular[]>>;
};

export const portaDocumentos: PortaDocumentos = portaDocumentosReal;
