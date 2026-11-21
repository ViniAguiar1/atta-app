import { z } from "zod";

// Bordas da Agenda (MIG-41; PDD v206 §10.2.2). O formato é o da PortaAgenda (src/server/agenda/porta.ts), que a porta
// real preenche a partir do api.agenda_day do Backend 2 (desenho mig-11-12). Todo campo derivado (Atrasado, ações
// permitidas, totais) vem calculado do banco, no fuso da clínica (ADR 0001 §4): a tela não recalcula regra.

// A linha, os estados e as ações vivem em src/lib/agenda/linha.ts (comuns à Agenda e à Pasta); daqui só reexporta.
export {
  ACOES,
  CONFIRMACOES,
  ESTADOS_DO_DOCUMENTO,
  STATUS,
  TIPOS,
  linhaSchema,
  type Acao,
  type EstadoDoDocumento,
  type LinhaDaAgenda,
  type Status,
} from "@/lib/agenda/linha";
import { STATUS, linhaSchema } from "@/lib/agenda/linha";

const isoDataHora = z.iso.datetime({ offset: true });
/** Data local da clínica, AAAA-MM-DD (o fuso é o de platform.tenant.timezone). */
export const dataLocalSchema = z.iso.date();


export const diaSchema = z.object({
  /** o dia pedido e o "hoje" da clínica, ambos no fuso dela */
  dataLocal: dataLocalSchema,
  hojeLocal: dataLocalSchema,
  /** fuso da clínica (platform.tenant.timezone), para mostrar os horários; nunca o do navegador */
  fuso: z.string().min(1),
  linhas: z.array(linhaSchema),
  proximoCursor: z.string().nullable(),
});
export type DiaDaAgenda = z.infer<typeof diaSchema>;

/** Filtro do dia. A busca (nome ou CPF) só trafega no corpo, nunca na URL (ADR 0001 §5). */
export const filtroDoDiaSchema = z.object({
  dataLocal: dataLocalSchema.optional(),
  vinculoProfissionalId: z.uuid().optional(),
  busca: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
  /** segmentos do card Check-in (§10.2.2): filtra a lista pelo estado */
  status: z.array(z.enum(STATUS)).min(1).max(STATUS.length).optional(),
  /** card Sem documento vinculado (§10.2.2): a regra de quem entra é do banco (p_no_document) */
  semDocumento: z.boolean().optional(),
});
export type FiltroDoDia = z.infer<typeof filtroDoDiaSchema>;

/**
 * A busca só sai com 2+ letras do nome ou com o CPF inteiro (11 dígitos), a mesma regra da lista de Pacientes (#49):
 * CPF pela metade não vira HMAC e nunca vira busca por prefixo (ADR 0001 §5).
 */
export function termoPronto(termo: string): boolean {
  const t = termo.trim();
  if (/^[\d.\-\s]+$/.test(t)) return t.replace(/\D/g, "").length === 11;
  return (t.match(/\p{L}/gu) ?? []).length >= 2;
}

/** Lista de uma visão por período (Todos, Concluídos): como o dia, sem a data pedida (cada linha traz a sua). */
export const listaSchema = z.object({
  hojeLocal: dataLocalSchema,
  fuso: z.string().min(1),
  linhas: z.array(linhaSchema),
  proximoCursor: z.string().nullable(),
});
export type ListaDaAgenda = z.infer<typeof listaSchema>;

/** Visão Todos (§10.2.2): agendamentos de hoje em diante, sem os concluídos; período e status vêm do painel Filtros. */
export const filtroDoPeriodoSchema = z.object({
  de: dataLocalSchema.optional(),
  ate: dataLocalSchema.optional(),
  vinculoProfissionalId: z.uuid().optional(),
  status: z.array(z.enum(STATUS)).min(1).max(STATUS.length).optional(),
  busca: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
});
export type FiltroDoPeriodo = z.infer<typeof filtroDoPeriodoSchema>;

/** Visão Concluídos (§10.2.2): "Esta semana" e "Este mês"; Ausente aparece como "Não realizado". */
export const PERIODOS_CONCLUIDOS = ["semana", "mes"] as const;
export type PeriodoConcluidos = (typeof PERIODOS_CONCLUIDOS)[number];
export const filtroDosConcluidosSchema = z.object({
  periodo: z.enum(PERIODOS_CONCLUIDOS),
  busca: z.string().trim().max(80).optional(),
  cursor: z.string().max(200).optional(),
});
export type FiltroDosConcluidos = z.infer<typeof filtroDosConcluidosSchema>;

/** Total do card: número do banco, ou null quando ainda não existe (porta vazia): a tela mostra "—". */
const total = z.number().int().nonnegative().nullable();
/** Cards do topo (§10.2.2). Sempre contam o dia de hoje, menos a Confirmação (agendamentos futuros). */
export const resumoSchema = z.object({
  hojeFaltam: total,
  hojeConcluidos: total,
  mesConcluidos: total,
  mesHorariosLivres: total,
  checkin: z.object({ emPreenchimento: total, pronto: total, emAtendimento: total }),
  confirmacao: z.object({ agendados: total, aConfirmar: total, confirmados: total }),
  semDocumento: total,
});
export type ResumoDaAgenda = z.infer<typeof resumoSchema>;

/**
 * Ações que gravam (PDD §10.2.2, "Ações por estado"), contrato aprovado pelo Tech Lead: união por ação, .strict e id
 * uuid. O banco confere de novo se a ação vale para o estado (ATTA-IN-0003:status).
 * Reabrir preenchimento (Ausente → Agendado, motivo obrigatório) entra no PR seguinte, depois do #283.
 */
/** Motivos de cancelamento (PDD §10.2.2): antes da chegada (Agendado, Ausente), decididos; depois da chegada (Em
 *  preenchimento, Pronto, Em atendimento), os 5 propostos (🔵). Códigos do #96; o banco confere a lista pelo estado. */
export const MOTIVOS_CANCELAR_ANTES = ["cancelado_pelo_paciente", "cancelado_pela_clinica", "agendado_por_engano"] as const;
export const MOTIVOS_CANCELAR_DEPOIS = [
  "paciente_desistiu",
  "contraindicacao_identificada",
  "paciente_solicitou_cancelamento",
  "conflito_agenda_profissional",
  "indisponibilidade_insumo",
] as const;
/** Motivos do "Concluir pela recepção" (PDD §10.2.3), em chip; a justificativa tem no mínimo 50 caracteres. */
export const MOTIVOS_CONCLUIR = ["profissional_inacessivel", "emergencia_clinica", "falha_tecnica_no_acesso"] as const;
export const JUSTIFICATIVA_MINIMA = 50;

export const entradaDaAcaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("confirmar"), id: z.uuid() }).strict(),
  z.object({ acao: z.literal("marcar_ausente"), id: z.uuid() }).strict(),
  z
    .object({
      acao: z.literal("cancelar"),
      id: z.uuid(),
      motivo: z.enum([...MOTIVOS_CANCELAR_ANTES, ...MOTIVOS_CANCELAR_DEPOIS]),
    })
    .strict(),
  z
    .object({
      acao: z.literal("concluir_pela_recepcao"),
      id: z.uuid(),
      motivo: z.enum(MOTIVOS_CONCLUIR),
      justificativa: z.string().trim().min(JUSTIFICATIVA_MINIMA).max(1000),
    })
    .strict(),
]);
export type EntradaDaAcao = z.infer<typeof entradaDaAcaoSchema>;

/** Ações com destino na tela (as outras do allowed_actions esperam a RPC e não viram botão). */
export const ACOES_COM_DESTINO = [
  "confirmar",
  "marcar_ausente",
  "cancelar",
  "concluir_pela_recepcao",
] as const satisfies readonly EntradaDaAcao["acao"][];

/** Avisos do topo da lista (§10.2.2). O ✓ confirma; o aviso volta quando a impressão digital muda. */
export const TIPOS_DE_AVISO = ["sem_documento", "atrasado", "pronto_sem_boarding_check", "ausentes"] as const;
export const avisoSchema = z.object({
  tipo: z.enum(TIPOS_DE_AVISO),
  impressao: z.string().min(1),
  itens: z.array(
    z.object({ atendimentoId: z.uuid(), nomeExibicao: z.string().min(1), inicio: isoDataHora, desde: isoDataHora.nullable() }),
  ),
});
export type AvisoDaAgenda = z.infer<typeof avisoSchema>;
