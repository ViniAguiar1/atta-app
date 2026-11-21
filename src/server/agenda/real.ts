import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type ErroDoBanco } from "@/lib/errors";
import { iniciais } from "@/lib/texto/iniciais";
import { criarClienteServidor } from "@/lib/supabase/server";
import { cpfHmac, normalizeCpf } from "@/server/crypto/cpf";
import {
  ACOES,
  CONFIRMACOES,
  ESTADOS_DO_DOCUMENTO,
  STATUS,
  TIPOS,
  filtroDoDiaSchema,
  termoPronto,
  type DiaDaAgenda,
  type LinhaDaAgenda,
  type ResumoDaAgenda,
} from "@/features/agenda/schema";
import type { PortaAgenda } from "./porta";

// Porta real da Agenda (MIG-41) sobre api.agenda_day e api.agenda_summary do Backend 2 (MIG-11c, #130), no formato combinado em migracao/desenho/mig-41-agenda-contrato.md. Cliente de servidor com a sessão do
// usuário (RLS e has_permission), nunca a secret key (ADR 0001 §4). A resposta do banco passa pelo Zod antes de virar o
// tipo da tela; erro do banco sai por falhaDoBanco, com o reason (ADR 0001 §5). Busca: nome em p_search; CPF inteiro
// vira HMAC no servidor (p_cpf_hmac, bytea em hex com \x), nunca em claro, na URL ou no log.

// --- Formato do banco (snake_case) ------------------------------------------------------------------------------------
const dataHora = z.iso.datetime({ offset: true });

const linhaDoBanco = z
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

const diaDoBanco = z.object({
  local_date: z.iso.date(),
  today_local_date: z.iso.date(),
  timezone: z.string().min(1),
  data: z.array(linhaDoBanco),
  page: z.object({ next_cursor: z.string().nullable() }),
});

const contagem = z.number().int().nonnegative();
const resumoDoBanco = z.object({
  today_remaining: contagem,
  today_concluded: contagem,
  month_concluded: contagem,
  month_free_slots: contagem,
  checkin: z.object({ em_preenchimento: contagem, pronto: contagem, em_atendimento: contagem }),
  confirmation: z.object({ agendados: contagem, a_confirmar: contagem, confirmados: contagem }),
  no_document: contagem,
});


// --- Mapeamento para o tipo da tela -----------------------------------------------------------------------------------
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

// --- Cliente mínimo (o tipo exato vem do database.types.ts quando o MIG-11c entrar) -----------------------------------
type RespostaDoBanco = PromiseLike<{ data: unknown; error: ErroDoBanco | null }>;
export type ClienteDaAgenda = {
  schema(nome: "api"): { rpc(fn: string, args: Record<string, unknown>): RespostaDoBanco };
};

const respostaInvalida = () => falha("INTERNO", MENSAGENS.INTERNO);

/** Busca única (decisão do Tech Lead): CPF inteiro vira p_cpf_hmac; o resto com 2+ letras vai em p_search. */
export function argumentosDaBusca(busca: string | undefined): Record<string, string> | null {
  const termo = busca?.trim();
  if (!termo) return {};
  if (!termoPronto(termo)) return null; // CPF pela metade ou 1 letra nunca sai (nada de prefixo de CPF)
  const cpf = normalizeCpf(termo);
  if (cpf) return { p_cpf_hmac: `\\x${cpfHmac(cpf).toString("hex")}` };
  return { p_search: termo };
}

/** O que já tem leitura real no banco (MIG-11c): o dia e os cards. Todos, Concluídos e avisos vêm depois. */
export type PortaAgendaReal = Pick<PortaAgenda, "dia" | "resumo">;

export function criarPortaAgendaReal(cliente: () => Promise<ClienteDaAgenda>): PortaAgendaReal {
  return {
    async dia(filtro) {
      const lido = filtroDoDiaSchema.safeParse(filtro);
      if (!lido.success) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "filtro", code: "VALIDACAO" }]);
      const busca = argumentosDaBusca(lido.data.busca);
      if (busca === null) return falha("VALIDACAO", MENSAGENS.VALIDACAO, [{ campo: "busca", code: "VALIDACAO" }]);
      const { data, error } = await (await cliente()).schema("api").rpc("agenda_day", {
        ...(lido.data.dataLocal ? { p_local_date: lido.data.dataLocal } : {}),
        ...(lido.data.vinculoProfissionalId ? { p_professional_link_id: lido.data.vinculoProfissionalId } : {}),
        ...(lido.data.cursor ? { p_cursor: lido.data.cursor } : {}),
        ...(lido.data.status ? { p_status: lido.data.status } : {}),
        ...(lido.data.semDocumento ? { p_no_document: true } : {}),
        ...busca,
      });
      if (error) return falhaDoBanco(error);
      const dia = diaDoBanco.safeParse(data);
      if (!dia.success) return respostaInvalida();
      const resultado: DiaDaAgenda = {
        dataLocal: dia.data.local_date,
        hojeLocal: dia.data.today_local_date,
        fuso: dia.data.timezone,
        linhas: dia.data.data.map(linhaDaTela),
        proximoCursor: dia.data.page.next_cursor,
      };
      return ok(resultado);
    },

    async resumo({ vinculoProfissionalId }) {
      const { data, error } = await (await cliente())
        .schema("api")
        .rpc("agenda_summary", vinculoProfissionalId ? { p_professional_link_id: vinculoProfissionalId } : {});
      if (error) return falhaDoBanco(error);
      const r = resumoDoBanco.safeParse(data);
      if (!r.success) return respostaInvalida();
      const resumo: ResumoDaAgenda = {
        hojeFaltam: r.data.today_remaining,
        hojeConcluidos: r.data.today_concluded,
        mesConcluidos: r.data.month_concluded,
        mesHorariosLivres: r.data.month_free_slots,
        checkin: {
          emPreenchimento: r.data.checkin.em_preenchimento,
          pronto: r.data.checkin.pronto,
          emAtendimento: r.data.checkin.em_atendimento,
        },
        confirmacao: {
          agendados: r.data.confirmation.agendados,
          aConfirmar: r.data.confirmation.a_confirmar,
          confirmados: r.data.confirmation.confirmados,
        },
        semDocumento: r.data.no_document,
      };
      return ok(resumo);
    },
  };
}

export const portaAgendaReal: PortaAgendaReal = criarPortaAgendaReal(
  async () => (await criarClienteServidor()) as unknown as ClienteDaAgenda,
);
