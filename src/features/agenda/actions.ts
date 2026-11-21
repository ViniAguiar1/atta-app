"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaAgenda } from "@/server/agenda/porta";
import {
  entradaDaAcaoSchema,
  filtroDoDiaSchema,
  filtroDoPeriodoSchema,
  filtroDosConcluidosSchema,
  type DiaDaAgenda,
  type ListaDaAgenda,
  type ResumoDaAgenda,
} from "./schema";

// Server actions da Agenda (POST): a busca por nome ou CPF vai no corpo, nunca na URL (ADR 0001 §5). Quem autoriza é
// a sessão do usuário na porta real (RLS e has_permission('appointments','view')). Log só com o desfecho, sem a busca.

export async function buscarNoDia(entrada: unknown): Promise<Resultado<DiaDaAgenda>> {
  const filtro = filtroDoDiaSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.dia(filtro.data);
  if (!resultado.ok) logger.warn("agenda.dia_falhou", { code: resultado.error.code });
  return resultado;
}

export async function resumirDia(): Promise<Resultado<ResumoDaAgenda>> {
  const resultado = await portaAgenda.resumo({});
  if (!resultado.ok) logger.warn("agenda.resumo_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarNoPeriodo(entrada: unknown): Promise<Resultado<ListaDaAgenda>> {
  const filtro = filtroDoPeriodoSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.periodo(filtro.data);
  if (!resultado.ok) logger.warn("agenda.periodo_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarConcluidos(entrada: unknown): Promise<Resultado<ListaDaAgenda>> {
  const filtro = filtroDosConcluidosSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.concluidos(filtro.data);
  if (!resultado.ok) logger.warn("agenda.concluidos_falhou", { code: resultado.error.code });
  return resultado;
}

/** Ação da linha (PDD §10.2.2): Zod .strict na borda; o banco confere estado e permissão. Log só com a ação e o code. */
export async function executarAcao(entrada: unknown): Promise<Resultado<null>> {
  const lida = entradaDaAcaoSchema.safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const resultado = await portaAgenda.acao(lida.data);
  if (!resultado.ok) logger.warn("agenda.acao_falhou", { acao: lida.data.acao, code: resultado.error.code });
  return resultado;
}
