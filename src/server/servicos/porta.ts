import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaServicosSimulada } from "./simulado";

// Contrato entre a exclusão de Serviço do catálogo (Configurações › Serviços) e o banco. Decisão do dono (PLANO, R15;
// PDD §10.3.1 omisso): excluir um Serviço que é o único procedimento de algum termo Ativo é recusado, com a lista dos
// termos que precisam de outro procedimento antes. A trava é do banco (Backend 6): o gatilho na exclusão lógica de
// atta_in.clinic_service recusa com P0001 ATTA-IN-0004 / detail 'clinic_service_id', e
// api.atta_in_service_delete_blockers(p_service_id) devolve (template_id, title) dos termos que bloqueiam.

/** Termo Ativo que tem este Serviço como único procedimento. */
export type TermoQueBloqueia = { templateId: string; titulo: string };

export type PortaServicos = {
  /** `api.atta_in_service_delete_blockers`: lista vazia quando o Serviço pode sair. */
  bloqueiosParaExcluir(servicoId: string): Promise<Resultado<TermoQueBloqueia[]>>;
  /** Exclusão lógica do Serviço (deleted_at). O gatilho do banco recusa com reason `ATTA-IN-0004:clinic_service_id`. */
  excluir(servicoId: string): Promise<Resultado<void>>;
};

export const portaServicos: PortaServicos = portaServicosSimulada;
