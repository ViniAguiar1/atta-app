"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaAssinaturas } from "@/server/assinaturas/porta";
import { type ConfiguracaoDeAssinatura, MODELOS } from "@/server/assinaturas/tipos";

// Escrita do Modelo de Assinatura (PDD §10.4.2), por POST. O banco confere o papel (settings.edit) e grava a trilha.
const modeloSchema = z.object({ modelo: z.enum(MODELOS) }).strict();

export async function salvarModelo(entrada: unknown): Promise<Resultado<ConfiguracaoDeAssinatura>> {
  const d = modeloSchema.safeParse(entrada);
  if (!d.success) return falhaDeValidacao(d.error.issues);
  const r = await portaAssinaturas.salvarModelo(d.data.modelo);
  logger.info("configuracoes.modelo_de_assinatura_salvo", { modelo: d.data.modelo, ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}
