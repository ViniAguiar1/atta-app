import { z } from "zod";

// Caixa de notificações do sino (MIG-45; PDD v206 §21 e §10.4.6): o "sino de Atividades", sempre ativo e não configurável,
// em linguagem simples, para a equipe acompanhar o dia. Nenhuma notificação traz dado de saúde (RN-NOT-01): o texto
// referencia o atendimento sem motivo, procedimento ou informação clínica. A leitura real vem do MIG-15 (Backend 4).

export const tipoDeNotificacao = z.enum(["agenda", "checkin", "documento", "equipe", "sistema"]);
export type TipoDeNotificacao = z.infer<typeof tipoDeNotificacao>;

export const notificacaoSchema = z.object({
  id: z.uuid(),
  tipo: tipoDeNotificacao,
  /** o evento em linguagem da tela, ex. "Atendimento sem documento vinculado" (o chip da captura 41) */
  evento: z.string().min(1).max(80),
  titulo: z.string().min(1).max(120),
  corpo: z.string().min(1).max(280),
  /** quando aconteceu (timestamptz) */
  em: z.iso.datetime({ offset: true }),
  lida: z.boolean(),
  /** atalho "Ir para …"; o rótulo sai do destino */
  destino: z.enum(["agenda", "pacientes", "documentos", "equipe", "configuracoes"]).nullable(),
});
export type Notificacao = z.infer<typeof notificacaoSchema>;

/** "Como as notificações chegam" (§10.4.6): os canais externos e os filtros; null = ainda sem configuração lida. */
export const canaisSchema = z.object({
  email: z.object({ ativo: z.boolean(), endereco: z.string().nullable() }).nullable(),
  whatsapp: z.object({ ativo: z.boolean() }).nullable(),
  pausaNoturna: z.object({ ativa: z.boolean() }).nullable(),
  resumo: z.enum(["tempo_real", "diario", "semanal"]).nullable(),
  /** quantos eventos vão por e-mail e por WhatsApp, do total configurável */
  eventos: z.object({ total: z.number().int().positive(), comEmail: z.number().int().nonnegative(), comWhatsapp: z.number().int().nonnegative() }).nullable(),
});
export type Canais = z.infer<typeof canaisSchema>;

export const caixaSchema = z.object({ itens: z.array(notificacaoSchema), canais: canaisSchema });
export type CaixaDeNotificacoes = z.infer<typeof caixaSchema>;

export const CANAIS_VAZIOS: Canais = { email: null, whatsapp: null, pausaNoturna: null, resumo: null, eventos: null };
