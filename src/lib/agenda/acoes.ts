import { z } from "zod";

// Ações da linha de agendamento (MIG-41; PDD v206 §10.2.2 e §10.2.3), comuns à Agenda e à Pasta do Paciente, por isso em
// lib (decisão do Tech Lead Frontend, ORDEM.md "Decisões de componentes"; mesmo molde do #226). Só Zod e constantes:
// nada de servidor. A Agenda reexporta daqui (features/agenda/schema.ts). Dono: Frontend 4.

/**
 * Ações que gravam (PDD §10.2.2, "Ações por estado"), contrato aprovado pelo Tech Lead: união por ação, .strict e id
 * uuid. O banco confere de novo se a ação vale para o estado (ATTA-IN-0003:status). O nome de cada ação é o mesmo do
 * allowed_actions da linha, para o menu ⋮ não precisar de tradução.
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
/** Motivos do "Reabrir preenchimento" de um Ausente (PDD §10.2.2, decisão da PO de 18/11/2026); códigos do #283. */
export const MOTIVOS_REABRIR = [
  "paciente_chegou_atrasado",
  "paciente_avisou_clinica_ajustou_horario",
  "ausente_por_engano",
] as const;

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
  // Ausente → Agendado, só no dia (o banco recusa com ATTA-IN-0003:reopen_day)
  z.object({ acao: z.literal("reabrir_preenchimento"), id: z.uuid(), motivo: z.enum(MOTIVOS_REABRIR) }).strict(),
]);
export type EntradaDaAcao = z.infer<typeof entradaDaAcaoSchema>;

/** Ações com destino na tela (as outras do allowed_actions esperam a RPC e não viram botão). */
export const ACOES_COM_DESTINO = [
  "confirmar",
  "marcar_ausente",
  "cancelar",
  "concluir_pela_recepcao",
  "reabrir_preenchimento",
] as const satisfies readonly EntradaDaAcao["acao"][];
