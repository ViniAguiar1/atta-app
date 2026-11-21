import "server-only";
import type { Resultado } from "@/lib/errors";
import type {
  Duracoes,
  FiltroDosHorarios,
  HorariosLivres,
  PacienteDoModal,
  ProfissionalDoModal,
} from "@/features/agenda/novoAgendamento";
import { portaNovoAgendamentoReal } from "./real";
import { portaNovoAgendamentoSimulada } from "./simulado";
import { portaNovoAgendamentoVazia } from "./vazia";

// Leituras do modal "Agendar Novo Atendimento" (MIG-41; contrato do Backend 2 aprovado pelo Tech Lead,
// migracao/desenho/mig-41-novo-agendamento-contrato.md, itens 1 a 5). Cliente de servidor com a sessão do usuário.
export type PortaNovoAgendamento = {
  /** Só quem pode receber agendamento: cadastro concluído e conselho regularizado. */
  profissionais(): Promise<Resultado<ProfissionalDoModal[]>>;
  /** Duração de Consulta, Avaliação e Retorno pela configuração da clínica. */
  duracoes(): Promise<Resultado<Duracoes>>;
  horariosLivres(filtro: FiltroDosHorarios): Promise<Resultado<HorariosLivres>>;
  /** Nome com 2+ letras ou CPF inteiro (vira HMAC na porta de Pacientes); nunca prefixo de CPF. */
  buscarPaciente(termo: string): Promise<Resultado<PacienteDoModal[]>>;
};

/**
 * Escolha só aqui, nunca na tela (regra de stage do Tech Lead Frontend): a busca de paciente já é real (api.patient_search,
 * MIG-12) em todos os ambientes; profissionais, durações e horários livres esperam o PR A do Backend 2 e usam a vazia
 * na produção (sem dado de mentira) e a simulada na prévia, no local e no CI.
 */
export function escolherPortaNovoAgendamento(ambiente = process.env.VERCEL_ENV): PortaNovoAgendamento {
  const semLeituraReal = ambiente === "production" ? portaNovoAgendamentoVazia : portaNovoAgendamentoSimulada;
  return { ...semLeituraReal, buscarPaciente: portaNovoAgendamentoReal.buscarPaciente };
}

export const portaNovoAgendamento: PortaNovoAgendamento = escolherPortaNovoAgendamento();
