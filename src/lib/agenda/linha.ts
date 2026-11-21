import { z } from "zod";

// Linha da Agenda no formato da tela (MIG-41; PDD v206 §10.2.2): o tipo, o Zod e os enums. Comum a duas features (a
// Agenda e a Pasta do Paciente, que lista os agendamentos da pessoa pelo api.patient_folder_appointments), por isso
// fica em lib (decisão do Tech Lead Frontend, ORDEM.md "Decisões de componentes"). Só Zod e tipos: nada de servidor.
// O parser do formato do banco fica em src/server/agenda/linha.ts. Dono: Frontend 4.

/** Os 7 estados do atendimento (tabela de estados do §10.2.2; nomes do desenho do Backend 2). */
export const STATUS = [
  "agendado",
  "em_preenchimento",
  "pronto",
  "em_atendimento",
  "concluido",
  "ausente",
  "cancelado",
] as const;
export type Status = (typeof STATUS)[number];

/** Os 4 tipos de atendimento (RN-AGN-TIPO-01; MIG-10). */
export const TIPOS = ["consulta", "avaliacao", "procedimento", "retorno"] as const;

/** Marcadores da coluna Documentos (§10.2.2): ● vinculado, ✓ assinado, ✗ recusado. */
export const ESTADOS_DO_DOCUMENTO = ["vinculado", "assinado", "recusado"] as const;
export type EstadoDoDocumento = (typeof ESTADOS_DO_DOCUMENTO)[number];

/** Rótulo de confirmação (§10.2.1): só exibição; o estado continua Agendado. */
export const CONFIRMACOES = ["fora_da_janela", "a_confirmar", "confirmado"] as const;

/** Ações do menu da linha (tabela "Ações por estado" do §10.2.2). Quais aparecem vem do banco (allowed_actions). */
export const ACOES = [
  "editar",
  "confirmar",
  "remarcar",
  "link",
  "marcar_ausente",
  "fluxo_alternativo",
  "fluxo_impresso",
  "reenviar_boarding_check",
  "concluir_pela_recepcao",
  "envios_dos_links",
  "enviar_termos",
  "reabrir_preenchimento",
  "detalhes",
  "cancelar",
] as const;
export type Acao = (typeof ACOES)[number];

const isoDataHora = z.iso.datetime({ offset: true });

export const linhaSchema = z.object({
  id: z.uuid(),
  inicio: isoDataHora,
  duracaoMin: z.number().int().positive(),
  tipo: z.enum(TIPOS),
  modalidade: z.enum(["presencial", "online"]),
  paciente: z.object({
    /** pessoa da rede ou paciente provisório da importação (ADR 0005); a Pasta confere o vínculo no servidor */
    tipo: z.enum(["pessoa", "provisorio"]),
    id: z.uuid(),
    /** em acesso pendente, o nome que a clínica digitou; no provisório, o da importação */
    nomeExibicao: z.string().min(1),
    /** já mascarado pelo servidor (`···.···.247-25`, ADR 0002 §6); null para estrangeiro ou sem CPF */
    cpfMascarado: z.string().nullable(),
    iniciais: z.string().max(2),
  }),
  servicos: z.array(z.object({ id: z.uuid(), nome: z.string().min(1) })),
  /** pelo vínculo com a clínica (ADR 0005); só agenda quem concluiu o PROpass, então o nome sempre existe aqui */
  profissional: z.object({ vinculoId: z.uuid(), nomeExibicao: z.string().min(1) }),
  /** vazio até o schema documents (Backend 3) entrar; o formato não muda */
  documentos: z.array(
    z.object({ id: z.uuid(), nome: z.string().min(1), opcional: z.boolean(), estado: z.enum(ESTADOS_DO_DOCUMENTO) }),
  ),
  status: z.enum(STATUS),
  /** selo Atrasado ao lado do status; não é estado (§10.2.2) */
  atrasado: z.boolean(),
  confirmacao: z.enum(CONFIRMACOES),
  boardingCheckEnviadoEm: isoDataHora.nullable(),
  /** allowed_actions e disabled_reason do banco; a ordem é a do menu */
  acoes: z.array(z.object({ acao: z.enum(ACOES), desabilitadaPor: z.string().optional() })),
});
export type LinhaDaAgenda = z.infer<typeof linhaSchema>;
