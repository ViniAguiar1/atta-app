import "server-only";
import type { Resultado } from "@/lib/errors";
import type {
  AvisoDaAgenda,
  DiaDaAgenda,
  FiltroDoDia,
  FiltroDoPeriodo,
  FiltroDosConcluidos,
  ListaDaAgenda,
  ResumoDaAgenda,
} from "@/features/agenda/schema";
import { portaAgendaReal } from "./real";
import { portaAgendaSimulada } from "./simulado";
import { portaAgendaVazia } from "./vazia";

// Contrato entre a Agenda do painel (MIG-41, Frontend 4) e o domínio da agenda (MIG-14a e MIG-11, Backend 2; MIG-13
// para o check-in). A forma foi aprovada pelo Tech Lead em 20/11 (ADR 0001 §4); os campos fecham com o Backend 2.
// A real chama api.agenda_day / agenda_summary / agenda_alerts com a sessão do usuário (cliente de servidor, nunca a
// secret key) e passa a resposta pelo schema. Até lá, a simulada, só com dado fictício e sem dica na tela.
// O "hoje" é sempre o da clínica (platform.tenant.timezone): sem dataLocal, o servidor usa o dia de hoje dela.
export type PortaAgenda = {
  /** Lista do dia, por horário. A busca por CPF vira HMAC na porta real; o CPF nunca vai à URL nem ao banco em claro. */
  dia(filtro: FiltroDoDia): Promise<Resultado<DiaDaAgenda>>;
  /** Números dos cards do topo; com o profissional filtrado, só os dele (§10.2.2). */
  resumo(filtro: { vinculoProfissionalId?: string }): Promise<Resultado<ResumoDaAgenda>>;
  /** Visão Todos (§10.2.2), sem os concluídos; leitura real: api.agenda_range do Backend 2 (a fazer). */
  periodo(filtro: FiltroDoPeriodo): Promise<Resultado<ListaDaAgenda>>;
  /** Visão Concluídos (§10.2.2), da semana ou do mês; leitura real: api.agenda_range do Backend 2 (a fazer). */
  concluidos(filtro: FiltroDosConcluidos): Promise<Resultado<ListaDaAgenda>>;
  /** Avisos do topo da lista ainda não confirmados (§10.2.2). */
  avisos(): Promise<Resultado<AvisoDaAgenda[]>>;
};

/**
 * Escolha da porta, só aqui e nunca na tela (regra de stage do Tech Lead Frontend): o que já tem leitura real no banco
 * (o dia, os cards, Todos e Concluídos) usa a real em todos os ambientes; os avisos, que esperam o agenda_alerts do
 * MIG-13, usam a vazia na produção (sem dado de mentira) e a simulada na prévia, no local e no CI.
 */
export function escolherPortaAgenda(ambiente = process.env.VERCEL_ENV): PortaAgenda {
  const semLeituraReal = ambiente === "production" ? portaAgendaVazia : portaAgendaSimulada;
  return {
    ...semLeituraReal,
    dia: portaAgendaReal.dia,
    resumo: portaAgendaReal.resumo,
    periodo: portaAgendaReal.periodo,
    concluidos: portaAgendaReal.concluidos,
  };
}

export const portaAgenda: PortaAgenda = escolherPortaAgenda();
