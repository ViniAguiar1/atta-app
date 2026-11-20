"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { type CelularDoFluxo, type ChaveDeParametro, type Parametro, portaConfiguracoes } from "@/server/configuracoes/porta";

// Escrita de um parâmetro de Configurações (POST). Quem confere papel, limite e regra cruzada é o banco (set_setting);
// aqui só o formato. Log só com a chave e o desfecho.
const CHAVES = [
  "link_envio_antecedencia_h",
  "link_validade_apos_h",
  "lembrete_1_min",
  "lembrete_2_min",
  "janela_de_confirmacao_h",
  "tolerancia_da_ausencia_min",
  "fluxo_alternativo_habilitado",
] as const satisfies readonly ChaveDeParametro[];

const entradaSchema = z.object({ chave: z.enum(CHAVES), valor: z.union([z.number().int(), z.boolean()]) });

export async function salvarParametro(entrada: unknown): Promise<Resultado<Parametro>> {
  const dados = entradaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaConfiguracoes.salvarParametro(dados.data.chave, dados.data.valor);
  logger.info("configuracoes.parametro_salvo", { chave: dados.data.chave, ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

// Celulares do Fluxo alternativo (PDD §15.3). O número vai só no corpo do POST e nunca no log.
const celularSchema = z.object({ nome: z.string().max(80), numero: z.string().max(30) });

export async function adicionarCelular(entrada: unknown): Promise<Resultado<CelularDoFluxo>> {
  const dados = celularSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaConfiguracoes.adicionarCelular(dados.data.nome, dados.data.numero);
  logger.info("configuracoes.celular_adicionado", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function removerCelular(entrada: unknown): Promise<Resultado<{ id: string }>> {
  const dados = z.object({ id: z.uuid() }).safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaConfiguracoes.removerCelular(dados.data.id);
  logger.info("configuracoes.celular_removido", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}
