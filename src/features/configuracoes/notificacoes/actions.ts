"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaAlertas } from "@/server/alertas/porta";
import { type AlertasDaEquipe, CANAIS, EVENTOS, FREQUENCIAS } from "@/server/alertas/tipos";

// Escrita de Configurações › Notificações (PDD §10.4.6), sempre por POST. Quem confere o papel (só ADMIN) e o formato
// final é o banco; aqui só a forma. O e-mail e o número vão só no corpo e nunca no log (log com o canal e o desfecho).
const chaves = EVENTOS.map((e) => e.chave) as [string, ...string[]];

const ligarSchema = z.object({ canal: z.enum(CANAIS), ativo: z.boolean() });
const destinoSchema = z.object({ canal: z.enum(CANAIS), destino: z.string().min(1).max(120), ativar: z.boolean().optional() });
const eventoSchema = z.object({ chave: z.enum(chaves), canal: z.enum(CANAIS), marcado: z.boolean() });
const filtrosSchema = z.object({ pausaNoturna: z.boolean(), frequenciaDoResumo: z.enum(FREQUENCIAS) });

const registrar = (evento: string, r: Resultado<unknown>, extra: Record<string, string> = {}) =>
  logger.info(evento, { ...extra, ok: r.ok, code: r.ok ? undefined : r.error.code });

export async function ligarCanal(entrada: unknown): Promise<Resultado<AlertasDaEquipe>> {
  const d = ligarSchema.safeParse(entrada);
  if (!d.success) return falhaDeValidacao(d.error.issues);
  const r = await portaAlertas.ligarCanal(d.data.canal, d.data.ativo);
  registrar("configuracoes.alerta_canal_ligado", r, { canal: d.data.canal });
  return r;
}

/** troca do destino numa ação própria (Tech Lead, 21/11): o e-mail ou o número só no corpo, nunca no log */
export async function alterarCanal(entrada: unknown): Promise<Resultado<AlertasDaEquipe>> {
  const d = destinoSchema.safeParse(entrada);
  if (!d.success) return falhaDeValidacao(d.error.issues);
  const r = await portaAlertas.alterarCanal(d.data.canal, d.data.destino, d.data.ativar);
  registrar("configuracoes.alerta_canal_alterado", r, { canal: d.data.canal });
  return r;
}

export async function marcarEvento(entrada: unknown): Promise<Resultado<AlertasDaEquipe>> {
  const d = eventoSchema.safeParse(entrada);
  if (!d.success) return falhaDeValidacao(d.error.issues);
  const r = await portaAlertas.marcarEvento(d.data.chave as AlertasDaEquipe["eventos"][number]["chave"], d.data.canal, d.data.marcado);
  registrar("configuracoes.alerta_evento_marcado", r, { canal: d.data.canal });
  return r;
}

export async function salvarFiltros(entrada: unknown): Promise<Resultado<AlertasDaEquipe>> {
  const d = filtrosSchema.safeParse(entrada);
  if (!d.success) return falhaDeValidacao(d.error.issues);
  const r = await portaAlertas.salvarFiltros(d.data);
  registrar("configuracoes.alerta_filtros_salvos", r);
  return r;
}
