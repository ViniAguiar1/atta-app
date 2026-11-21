"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaDocumentos } from "@/server/documentos/porta";
import type { ServicoParaVincular } from "@/server/documentos/tipos";

// Ações do ⋮ de Termos & Docs (PDD §10.3.1; #69 do Backend 6). Quem decide se a ação vale é o banco
// (allowed_actions e as funções em api, com has_permission('documents', …)); aqui só a borda: o id no formato e os
// procedimentos como lista de uuids. Log só com o desfecho.
const id = z.uuid();

export async function publicarModelo(entrada: unknown): Promise<Resultado<{ versao: number }>> {
  const modelo = id.safeParse(entrada);
  if (!modelo.success) return falhaDeValidacao(modelo.error.issues);
  const r = await portaDocumentos.publicar(modelo.data);
  logger.info("documentos.publicar", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function inativarModelo(entrada: unknown): Promise<Resultado<void>> {
  const modelo = id.safeParse(entrada);
  if (!modelo.success) return falhaDeValidacao(modelo.error.issues);
  const r = await portaDocumentos.inativar(modelo.data);
  logger.info("documentos.inativar", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function vincularProcedimentos(entrada: unknown): Promise<Resultado<void>> {
  const dados = z.object({ modeloId: id, servicoIds: z.array(id).max(200) }).safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaDocumentos.vincular(dados.data.modeloId, [...new Set(dados.data.servicoIds)]);
  logger.info("documentos.vincular", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function listarServicos(): Promise<Resultado<ServicoParaVincular[]>> {
  return portaDocumentos.servicos();
}
