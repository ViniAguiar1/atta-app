"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaAgenda } from "@/server/agenda/porta";
import { filtroDoDiaSchema, type DiaDaAgenda } from "./schema";

// Server actions da Agenda (POST): a busca por nome ou CPF vai no corpo, nunca na URL (ADR 0001 §5). Quem autoriza é
// a sessão do usuário na porta real (RLS e has_permission('appointments','view')). Log só com o desfecho, sem a busca.

export async function buscarNoDia(entrada: unknown): Promise<Resultado<DiaDaAgenda>> {
  const filtro = filtroDoDiaSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.dia(filtro.data);
  if (!resultado.ok) logger.warn("agenda.dia_falhou", { code: resultado.error.code });
  return resultado;
}
