import { z } from "zod";

// Bordas da Agenda (MIG-41; PDD v206 §10.2.2). O formato é o da PortaAgenda (src/server/agenda/porta.ts), que a porta
// real preenche a partir do api.agenda_day do Backend 2 (desenho mig-11-12). Todo campo derivado (Atrasado, ações
// permitidas, totais) vem calculado do banco, no fuso da clínica (ADR 0001 §4): a tela não recalcula regra.

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
/** Data local da clínica, AAAA-MM-DD (o fuso é o de platform.tenant.timezone). */
export const dataLocalSchema = z.iso.date();

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
});
export type FiltroDoDia = z.infer<typeof filtroDoDiaSchema>;

/** Cards do topo (§10.2.2). Sempre contam o dia de hoje, menos a Confirmação (agendamentos futuros). */
export const resumoSchema = z.object({
  hojeFaltam: z.number().int().nonnegative(),
  hojeConcluidos: z.number().int().nonnegative(),
  mesConcluidos: z.number().int().nonnegative(),
  mesHorariosLivres: z.number().int().nonnegative(),
  checkin: z.object({
    emPreenchimento: z.number().int().nonnegative(),
    pronto: z.number().int().nonnegative(),
    emAtendimento: z.number().int().nonnegative(),
  }),
  confirmacao: z.object({
    agendados: z.number().int().nonnegative(),
    aConfirmar: z.number().int().nonnegative(),
    confirmados: z.number().int().nonnegative(),
  }),
  semDocumento: z.number().int().nonnegative(),
});
export type ResumoDaAgenda = z.infer<typeof resumoSchema>;

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
