"use server";

import { headers } from "next/headers";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/server";
import { convidarMembro } from "@/server/equipe/convite";
import { conviteSchema } from "./schema";

// "Convidar Usuário" de Equipe & Permissões (PDD v206 §10.4.3). POST com o e-mail no corpo, nunca na URL.
export async function convidarUsuario(entrada: unknown): Promise<Resultado<{ vinculo: string }>> {
  const dados = conviteSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await convidarMembro(dados.data, {
    servidor: await criarClienteServidor(),
    admin: criarClienteAdmin(await headers()),
  });
  if (resultado.ok) logger.info("equipe.convite_enviado", { ok: true });
  else logger.warn("equipe.convite_falhou", { code: resultado.error.code, reason: resultado.error.reason ?? null });
  return resultado;
}
