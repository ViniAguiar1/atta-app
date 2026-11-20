"use server";

import { z } from "zod";
import { falha, falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaServicos, type TermoQueBloqueia } from "@/server/servicos/porta";
import { mensagemDeTermos, REASON_SERVICO_COM_TERMOS } from "./termos";

// Server action de excluir Serviço do catálogo. Decisão do dono (PLANO, R15; PDD §10.3.1 omisso): Serviço que é o
// único procedimento de algum termo Ativo não sai; a resposta lista os termos que precisam de outro procedimento antes.
// A trava de verdade é do banco (gatilho do Backend 6); a action consulta antes para a mensagem vir com a lista, e, se o
// gatilho recusar mesmo assim (corrida: um termo ficou Ativo entre a consulta e a exclusão), consulta de novo.
// O texto é provisório até a PO responder (textos-para-a-po.md, R15). Log sem os títulos.
const entradaSchema = z.object({ servicoId: z.uuid() });

const conflitoDeTermos = (termos: readonly TermoQueBloqueia[]): Resultado<never> =>
  falha("CONFLITO", mensagemDeTermos(termos), undefined, REASON_SERVICO_COM_TERMOS);

export async function excluirServico(entrada: unknown): Promise<Resultado<{ excluido: true }>> {
  const dados = entradaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const { servicoId } = dados.data;

  const antes = await portaServicos.bloqueiosParaExcluir(servicoId);
  if (!antes.ok) return antes;
  if (antes.data.length > 0) {
    logger.info("servico.exclusao_bloqueada", { termos: antes.data.length, momento: "antes" });
    return conflitoDeTermos(antes.data);
  }

  const r = await portaServicos.excluir(servicoId);
  if (r.ok) return ok({ excluido: true });
  if (r.error.reason !== REASON_SERVICO_COM_TERMOS) return r;

  // corrida: o gatilho recusou depois da consulta; a lista é lida de novo para a mensagem vir certa
  const depois = await portaServicos.bloqueiosParaExcluir(servicoId);
  logger.info("servico.exclusao_bloqueada", { termos: depois.ok ? depois.data.length : -1, momento: "corrida" });
  if (depois.ok && depois.data.length > 0) return conflitoDeTermos(depois.data);
  return r;
}
