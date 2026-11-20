"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaCheckin } from "@/server/checkin/porta";
import { codigoSchema, identificacaoSchema, reenvioSchema, type Situacao } from "./schema";

// Server actions do check-in (POST; o CPF vai no corpo, nunca na URL). Rota de link: sem sessão de staff (ADR 0001 §4).
// Log só com o desfecho, sem CPF, código nem final do celular.

export async function iniciarCheckin(entrada: unknown): Promise<Resultado<{ desafio: string; finalCelular: string }>> {
  const dados = identificacaoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaCheckin.iniciar(dados.data.portal, dados.data.cpf);
  logger.info("checkin.codigo_pedido", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

export async function confirmarCodigo(entrada: unknown): Promise<Resultado<{ situacao: Situacao }>> {
  const dados = codigoSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaCheckin.confirmar(dados.data.desafio, dados.data.codigo);
  logger.info("checkin.codigo_conferido", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

export async function reenviarCodigo(entrada: unknown): Promise<Resultado<{ finalCelular: string }>> {
  const dados = reenvioSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  return portaCheckin.reenviar(dados.data.desafio);
}
