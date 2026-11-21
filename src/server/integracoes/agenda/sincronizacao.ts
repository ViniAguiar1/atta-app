import "server-only";
/**
 * Regras puras da sincronização da agenda externa (PDD v206 §10.4.5):
 * - frequência de sincronização automática: 15 min, 30 min, 1 h ou manual (só o botão "sincronizar agora");
 * - o que veio do provedor é comparado com o que já foi trazido, pelo id externo e pela versão (etag/changeKey).
 * O que fazer com cada grupo (criar o agendamento a completar pela recepção, atualizar data e hora) é da agenda
 * (MIG-11, com o Backend 2). Evento removido na agenda externa: o PDD não diz; fica marcado e a decisão vai ao CTO.
 */
import type { EventoOcupado, FrequenciaSincronizacao } from "./porta";

const INTERVALO_MS: Readonly<Record<Exclude<FrequenciaSincronizacao, "manual">, number>> = {
  "15min": 15 * 60_000,
  "30min": 30 * 60_000,
  "1h": 60 * 60_000,
};

/** Quando cabe a próxima leitura automática; `null` em "manual". Sem leitura anterior, já. */
export function proximaSincronizacao(
  ultima: Date | null,
  frequencia: FrequenciaSincronizacao,
  agora: Date,
): Date | null {
  if (frequencia === "manual") return null;
  if (!ultima) return agora;
  return new Date(ultima.getTime() + INTERVALO_MS[frequencia]);
}

export interface PlanoSincronizacao {
  readonly novos: readonly EventoOcupado[];
  readonly alterados: readonly EventoOcupado[];
  /** ids externos removidos ou cancelados na agenda de origem */
  readonly removidos: readonly string[];
}

/**
 * Compara a página do provedor com os já trazidos (id externo → versão). Dia inteiro não vira horário ocupado
 * (lembrete de agenda, não atendimento); o resto entra pela versão.
 */
export function planejarSincronizacao(
  eventos: readonly EventoOcupado[],
  trazidos: ReadonlyMap<string, string>,
): PlanoSincronizacao {
  const novos: EventoOcupado[] = [];
  const alterados: EventoOcupado[] = [];
  const removidos: string[] = [];
  for (const e of eventos) {
    const conhecido = trazidos.get(e.idExterno);
    if (e.removido || e.diaInteiro) {
      if (conhecido !== undefined) removidos.push(e.idExterno);
      continue;
    }
    if (conhecido === undefined) novos.push(e);
    else if (conhecido !== e.versao) alterados.push(e);
  }
  return { novos, alterados, removidos };
}
