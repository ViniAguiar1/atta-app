import { z } from "zod";

// Painel de Métricas (MIG-46; PDD v206 §10.5): os números do gestor, sempre contagens e tempos agregados, nunca
// conteúdo clínico (§10.5.2). Cada número pode faltar (null): a tela mostra "—", nunca um número inventado. A leitura
// real vem do MIG-16 (Backend 4); o schema valida a resposta dela quando entrar.

const n = z.number().int().nonnegative().nullable();

export const painelDeMetricasSchema = z.object({
  /** atendimentos de hoje que entram nas métricas (com check-in iniciado) */
  atendimentosValidosHoje: n,
  /** Tempo Médio de Check-in, a North Star (§10.5.1): média de 30 dias e a de hoje, em segundos */
  tempoMedioCheckin: z.object({ mediaSegundos: n, hojeSegundos: n }),
  /** Tempo Operacional Salvo no mês, em horas (§10.5.1) */
  tempoOperacionalSalvoHoras: n,
  /** Atendimentos Extras no Mês (§10.5.1 e §10.5.2): tempo economizado ÷ tempo médio de atendimento */
  atendimentosExtrasMes: n,
  /** Documentos assinados no mês e, dentro deles, os Formulários de Saúde concluídos (§10.5.2) */
  documentosAssinadosMes: n,
  formulariosDeSaudeMes: n,
  /** Taxa de Preparação Prévia: atendimentos de hoje que chegaram com o check-in pronto */
  preparacaoPrevia: z.object({ prontos: z.number().int().nonnegative(), total: z.number().int().positive() }).nullable(),
  /** Tempos de hoje, em segundos: check-in do paciente (do escaneamento ao pronto), recepção (até a liberação), mediana e p90 */
  temposDeHoje: z.object({ checkinSegundos: n, recepcaoSegundos: n, medianaSegundos: n, p90Segundos: n }),
});

export type PainelDeMetricas = z.infer<typeof painelDeMetricasSchema>;

/** Sem nenhum dado: o estado vazio do design. */
export const PAINEL_VAZIO: PainelDeMetricas = {
  atendimentosValidosHoje: null,
  tempoMedioCheckin: { mediaSegundos: null, hojeSegundos: null },
  tempoOperacionalSalvoHoras: null,
  atendimentosExtrasMes: null,
  documentosAssinadosMes: null,
  formulariosDeSaudeMes: null,
  preparacaoPrevia: null,
  temposDeHoje: { checkinSegundos: null, recepcaoSegundos: null, medianaSegundos: null, p90Segundos: null },
};
