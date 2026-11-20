"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaPacientes, type LinhaDePaciente, type PaginaDePacientes } from "@/server/pacientes/porta";
import { buscaSchema, cursorSchema } from "./schema";

// Server actions da lista de Pacientes (POST; o termo da busca vai no corpo, nunca na URL). A sessão é a do painel: o
// proxy desvia quem não tem, e a porta real chama api.* com ela (a RLS e a função conferem tenant e permissão).
// Log só com o desfecho, sem nome, CPF nem contato.

export async function listarPacientes(apos?: unknown): Promise<Resultado<PaginaDePacientes>> {
  let cursor;
  if (apos !== undefined) {
    const dados = cursorSchema.safeParse(apos);
    if (!dados.success) return falhaDeValidacao(dados.error.issues);
    cursor = dados.data;
  }
  const resultado = await portaPacientes.listar(cursor);
  if (!resultado.ok) logger.warn("pacientes.lista_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarPacientes(entrada: unknown): Promise<Resultado<LinhaDePaciente[]>> {
  const dados = buscaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.buscar(dados.data.termo);
  if (!resultado.ok) logger.warn("pacientes.busca_falhou", { code: resultado.error.code });
  return resultado;
}
