import "server-only";
import { portaAttaReal } from "./real";

// Contrato do Módulo ATTA (MIG-48; PDD v206 §10.6) com o banco. Por enquanto, só os números da Privacidade & Dados
// (§10.6.3, captura 21). Cada número vem do dado real que já existe; o que ainda não tem API (documentos assinados,
// respostas de saúde, registros de auditoria e requisições de titular: Backend 3, Backend 2 e Backend 5) volta null, e a
// tela mostra "—" (decisão do CTO, 20/11: nada de número inventado). Como tudo aqui é real ou null, não há porta
// simulada nem vazia: a mesma implementação vale na produção, na prévia e no local. Quem autoriza é a RLS.

export type ResumoDosDados = {
  membros: number | null; // api.team_list, só ADMIN (para o COLABORADOR, null)
  procedimentos: number | null; // atta_in.clinic_service vivos
  modelos: number | null; // api.atta_in_template_list
  pacientes: number | null; // api.patient_list, total_active
  documentosAssinados: number | null; // sem API ainda (MIG-21)
  respostasDeSaude: number | null; // sem API ainda (MIG-22); só da clínica, nunca da rede
  registrosDeAuditoria: number | null; // sem API ainda
  requisicoesDeTitular: number | null; // sem API ainda (Backend 3)
  requisicoesEmAberto: number | null; // sem API ainda (Backend 3)
};

export type PortaAtta = { resumoDosDados(): Promise<ResumoDosDados> };

export const portaAtta: PortaAtta = portaAttaReal;
