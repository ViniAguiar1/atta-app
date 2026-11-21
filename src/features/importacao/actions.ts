"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaImportacao, type PreviaImportacao } from "@/server/importacao/porta";

// Server actions do fluxo "Importar base de pacientes" (PDD v206 §10.1; PLANO "Importação de pacientes, MIG-34"), as
// mesmas no módulo Pacientes e em Configurações (decisão do CTO, 21/11). Zod .strict na borda; quem decide é a porta da
// Integrações (só ADMIN, cota, declaração antes do envio). O arquivo não passa por aqui: vai direto ao armazenamento,
// pela URL assinada (a Vercel recusa corpo acima de ~4,5 MB). Log só com o passo e o code, nunca nome, CPF ou linha.

// os ids viram z.uuid() com a porta real (nota do TL); a simulada usa ids com prefixo "sim-"
const idSchema = z.string().min(1).max(120);
const registrar = (passo: string, r: Resultado<unknown>) => {
  if (!r.ok) logger.warn("importacao.passo_falhou", { passo, code: r.error.code });
};

export async function urlDoModelo(): Promise<Resultado<{ url: string }>> {
  const r = await portaImportacao.urlDoModelo();
  registrar("modelo", r);
  return r;
}

export async function declararImportacao(entrada: unknown): Promise<Resultado<{ declaration_id: string }>> {
  const lida = z.object({ versao: z.string().min(1).max(20) }).strict().safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const r = await portaImportacao.declarar(lida.data.versao);
  registrar("declaracao", r);
  return r;
}

export async function iniciarEnvioDaImportacao(entrada: unknown): Promise<Resultado<{ import_id: string; upload_url: string }>> {
  // o teto de 20 MB também na borda (nota do TL); a porta confere de novo, e o bucket tem o seu limite
  const lida = z.object({ declarationId: idSchema, tamanho: z.number().int().positive().max(20 * 1024 * 1024) }).strict().safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const r = await portaImportacao.iniciarEnvio(lida.data.declarationId, lida.data.tamanho);
  registrar("envio", r);
  return r;
}

export async function previaDaImportacao(entrada: unknown): Promise<Resultado<PreviaImportacao>> {
  const lida = z.object({ importId: idSchema }).strict().safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const r = await portaImportacao.previa(lida.data.importId);
  registrar("previa", r);
  return r;
}

export async function confirmarImportacao(entrada: unknown): Promise<Resultado<{ status: "processando"; due_at: string }>> {
  const lida = z.object({ importId: idSchema }).strict().safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const r = await portaImportacao.confirmar(lida.data.importId);
  logger.info("importacao.confirmada", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}
