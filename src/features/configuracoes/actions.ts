"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { type ChaveDeParametro, type Parametro, portaConfiguracoes } from "@/server/configuracoes/porta";

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
