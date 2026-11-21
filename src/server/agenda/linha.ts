import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { iniciais } from "@/lib/texto/iniciais";
import { ACOES, CONFIRMACOES, ESTADOS_DO_DOCUMENTO, STATUS, TIPOS, type LinhaDaAgenda } from "@/lib/agenda/linha";

// Linha da agenda no formato do banco (snake_case; private.agenda_rows do Backend 2), comum ao api.agenda_day, ao
// api.agenda_range e ao api.patient_folder_appointments da Pasta do Paciente. Daqui sai o tipo da tela
// (src/lib/agenda/linha.ts). Cada linha é conferida à parte: a fora do formato sai da lista, com a quantidade no log e
// nunca o corpo (tem nome e CPF mascarado). Dono: Frontend 4 (decisão do Tech Lead Frontend, ORDEM.md).

const dataHora = z.iso.datetime({ offset: true });

export const linhaDoBanco = z
  .object({
    id: z.uuid(),
    starts_at: dataHora,
    duration_min: z.number().int().positive(),
    appointment_type: z.enum(TIPOS),
    modality: z.enum(["presencial", "online"]),
    patient: z.object({
      person_id: z.uuid().nullable(),
      provisional_patient_id: z.uuid().nullable(),
      display_name: z.string().min(1),
      cpf_masked: z.string().nullable(),
    }),
    services: z.array(z.object({ id: z.uuid(), name: z.string().min(1) })),
    professional: z.object({ link_id: z.uuid(), display_name: z.string().min(1) }),
    documents: z.array(
      z.object({ id: z.uuid(), name: z.string().min(1), optional: z.boolean(), state: z.enum(ESTADOS_DO_DOCUMENTO) }),
    ),
    status: z.enum(STATUS),
    late: z.boolean(),
    confirmation: z.enum(CONFIRMACOES),
    boarding_check_sent_at: dataHora.nullable(),
    allowed_actions: z.array(z.object({ action: z.enum(ACOES), disabled_reason: z.string().nullish() })),
  })
  // exatamente um dos dois ids do paciente (ADR 0005 §4)
  .refine((l) => (l.patient.person_id === null) !== (l.patient.provisional_patient_id === null));

export function linhaDaTela(l: z.infer<typeof linhaDoBanco>): LinhaDaAgenda {
  const provisorio = l.patient.provisional_patient_id;
  return {
    id: l.id,
    inicio: l.starts_at,
    duracaoMin: l.duration_min,
    tipo: l.appointment_type,
    modalidade: l.modality,
    paciente: {
      tipo: provisorio ? "provisorio" : "pessoa",
      id: provisorio ?? l.patient.person_id ?? "",
      nomeExibicao: l.patient.display_name,
      cpfMascarado: l.patient.cpf_masked,
      iniciais: iniciais(l.patient.display_name),
    },
    servicos: l.services.map((s) => ({ id: s.id, nome: s.name })),
    profissional: { vinculoId: l.professional.link_id, nomeExibicao: l.professional.display_name },
    documentos: l.documents.map((d) => ({ id: d.id, nome: d.name, opcional: d.optional, estado: d.state })),
    status: l.status,
    atrasado: l.late,
    confirmacao: l.confirmation,
    boardingCheckEnviadoEm: l.boarding_check_sent_at,
    acoes: l.allowed_actions.map((a) => (a.disabled_reason ? { acao: a.action, desabilitadaPor: a.disabled_reason } : { acao: a.action })),
  };
}

/** Cada linha conferida à parte: a fora do formato sai da lista (log com a quantidade, nunca o corpo). */
export function lerLinhas(brutas: unknown[]): LinhaDaAgenda[] {
  const linhas = brutas.flatMap((bruta) => {
    const linha = linhaDoBanco.safeParse(bruta);
    return linha.success ? [linhaDaTela(linha.data)] : [];
  });
  const descartadas = brutas.length - linhas.length;
  if (descartadas > 0) logger.error("agenda.linha_fora_do_formato", { code: "INTERNO", quantidade: descartadas });
  return linhas;
}
