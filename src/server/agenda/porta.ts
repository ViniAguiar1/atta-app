import "server-only";
import type { Resultado } from "@/lib/errors";
import type { AvisoDaAgenda, DiaDaAgenda, FiltroDoDia, ResumoDaAgenda } from "@/features/agenda/schema";
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
  /** Avisos do topo da lista ainda não confirmados (§10.2.2). */
  avisos(): Promise<Resultado<AvisoDaAgenda[]>>;
};

/**
 * Escolha da porta, só aqui e nunca na tela (regra de stage do Tech Lead Frontend): sem leitura real, a produção usa a
 * vazia (estado vazio do design, sem dado de mentira) e a prévia, o local e o CI usam a simulada. A porta real (MIG-11c)
 * entra no lugar das duas quando o api.agenda_day estiver na main.
 */
export function escolherPortaAgenda(ambiente = process.env.VERCEL_ENV): PortaAgenda {
  return ambiente === "production" ? portaAgendaVazia : portaAgendaSimulada;
}

export const portaAgenda: PortaAgenda = escolherPortaAgenda();
