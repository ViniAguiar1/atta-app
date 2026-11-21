import { z } from "zod";
import { TIPOS } from "@/lib/agenda/linha";
import { dataLocalSchema } from "./schema";

// Bordas do modal "Agendar Novo Atendimento" (MIG-41; PDD v206 §10.2 e captura 34). Os nomes seguem o contrato do
// Backend 2 aprovado pelo Tech Lead (migracao/desenho/mig-41-novo-agendamento-contrato.md): itens 1 a 5. A criação
// (item 8), os Serviços (2), os documentos (6) e o Retorno (7) entram nos PRs seguintes.

const isoDataHora = z.iso.datetime({ offset: true });

/** Profissional que pode receber agendamento: cadastro concluído e conselho regularizado (ADR 0006 §3; #282). */
export const profissionalDoModalSchema = z.object({
  /** vínculo com a clínica: é o que o agendamento grava */
  vinculoId: z.uuid(),
  nome: z.string().min(1),
  /** "CRM/SP 123456", pronto do servidor; null sem conselho informado */
  conselho: z.string().min(1).nullable(),
});
export type ProfissionalDoModal = z.infer<typeof profissionalDoModalSchema>;

/** Duração por tipo, da configuração da clínica (padrões da PO: 60/30/30). O Procedimento soma os Serviços. */
export const duracoesSchema = z.object({
  consulta: z.number().int().positive(),
  avaliacao: z.number().int().positive(),
  retorno: z.number().int().positive(),
});
export type Duracoes = z.infer<typeof duracoesSchema>;

/** Pedido de horários livres (contrato, item 4): duração entre 5 e 480 min. */
export const filtroDosHorariosSchema = z
  .object({
    vinculoProfissionalId: z.uuid(),
    dataLocal: dataLocalSchema,
    duracaoMin: z.number().int().min(5).max(480),
  })
  .strict();
export type FiltroDosHorarios = z.infer<typeof filtroDosHorariosSchema>;

/** Horários livres de 1 h onde a duração cabe (PDD §10.2, "Duração do atendimento"), no fuso da clínica. */
export const horariosLivresSchema = z.object({
  dataLocal: dataLocalSchema,
  fuso: z.string().min(1),
  horarios: z.array(isoDataHora),
  primeiroLivre: isoDataHora.nullable(),
  /** o primeiro em até 60 dias, quando o dia pedido não tem nenhum */
  proximoLivre: z.object({ dataLocal: dataLocalSchema, inicio: isoDataHora }).nullable(),
});
export type HorariosLivres = z.infer<typeof horariosLivresSchema>;

/** Paciente achado na busca do modal (api.patient_search): tudo mascarado pelo servidor; nunca o número inteiro. */
export const pacienteDoModalSchema = z.object({
  id: z.uuid(),
  nome: z.string().min(1),
  /** "···.···.247-25"; null sem documento (cadastro incompleto) */
  documentoMascarado: z.string().min(1).nullable(),
  /** WhatsApp para a modalidade online, só mascarado (Tech Lead, contrato item 5) */
  whatsappMascarado: z.string().min(1).nullable(),
});
export type PacienteDoModal = z.infer<typeof pacienteDoModalSchema>;

/** Busca do paciente: nome com 2+ letras ou CPF inteiro (termoPronto), só no corpo da action. */
export const buscaDoPacienteSchema = z.object({ termo: z.string().trim().min(2).max(80) }).strict();

export const MODALIDADES = ["presencial", "online"] as const;
export type Modalidade = (typeof MODALIDADES)[number];
export type TipoDeAtendimento = (typeof TIPOS)[number];
