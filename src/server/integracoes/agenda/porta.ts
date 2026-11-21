import "server-only";
/**
 * Porta da agenda externa da clínica: Google Agenda e Microsoft Outlook (PDD v206 §10.4.5 e §20.3; ADR 0022, parte A,
 * do atta-platform, onde não contradiz o PDD).
 *
 * Do PDD (decisões da PO em 18/11/2026), por cima do ADR 0022:
 * - a agenda conectada é a da CLÍNICA; não há mapeamento agenda↔profissional;
 * - só leitura; o ATTA-in cria o agendamento com data e hora, e a recepção completa paciente,
 *   Serviço, profissional, Tipo de Atendimento e documentos;
 * - desconectar para a leitura; o que já foi trazido continua no ATTA-in.
 * Ingestão mínima: início, fim, id e versão. Título, descrição, local e participantes nunca são gravados.
 */
import type { ResultadoProvedor } from "../comum/resultado-provedor";

export type ProvedorAgendaId = "google" | "microsoft";

export interface Tokens {
  readonly accessToken: string; // só em memória
  readonly refreshToken?: string; // cifrado no Vault do Supabase, por conexão
  readonly expiraEm: Date;
}

export interface AgendaExterna {
  readonly id: string;
  readonly principal: boolean;
}

export interface EventoOcupado {
  readonly idExterno: string;
  readonly versao: string; // etag / changeKey
  readonly inicio: Date;
  readonly fim: Date;
  readonly diaInteiro: boolean;
  readonly removido: boolean;
}

export interface PaginaEventos {
  readonly eventos: readonly EventoOcupado[];
  /** Cursor incremental (syncToken do Google / deltaLink da Microsoft). */
  readonly cursor: string;
}

export interface ProvedorAgenda {
  readonly provedor: ProvedorAgendaId;
  urlAutorizacao(p: { state: string; codeChallenge: string; redirectUri: string }): string;
  trocarCodigo(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<ResultadoProvedor<Tokens>>;
  renovar(refreshToken: string): Promise<ResultadoProvedor<Tokens>>;
  listarAgendas(accessToken: string): Promise<ResultadoProvedor<readonly AgendaExterna[]>>;
  /** Sem cursor: carga inicial em [de, ate] (agora até +90 dias). Com cursor: só o que mudou. */
  listarOcupados(p: {
    accessToken: string;
    agendaId: string;
    de: Date;
    ate: Date;
    cursor?: string;
  }): Promise<ResultadoProvedor<PaginaEventos>>;
  /** Ao desconectar ou encerrar a clínica. */
  revogar(token: string): Promise<ResultadoProvedor<void>>;
}

/** Escopos mínimos, só leitura (ADR 0022 A.3). */
export const ESCOPOS = {
  google: [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.owned.readonly",
  ],
  microsoft: ["offline_access", "Calendars.ReadBasic"],
} as const;

/** Frequências da tela (10.4.5). */
export type FrequenciaSincronizacao = "15min" | "30min" | "1h" | "manual";
