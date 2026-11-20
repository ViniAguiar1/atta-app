"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { falha, falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";

// Entrada com e-mail e senha (MIG-03; contrato do Backend 1, que completa no MIG-03b com Google, sair, 2º fator e o
// `volta` validado). Até lá, quem entra vai para /painel.
// POST pela server action: e-mail e senha nunca vão na URL. Log só com o desfecho, sem e-mail.
const entradaSchema = z.object({ email: z.email(), senha: z.string().min(1) });

export async function entrarComSenha(_anterior: Resultado<never> | null, dados: FormData): Promise<Resultado<never>> {
  const entrada = entradaSchema.safeParse({ email: dados.get("email"), senha: dados.get("senha") });
  if (!entrada.success) return falhaDeValidacao(entrada.error.issues);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: entrada.data.email, password: entrada.data.senha });
  if (error) {
    const status = error.status ?? 0;
    logger.info("auth.entrada", { ok: false, status });
    // a mesma mensagem para e-mail inexistente e senha errada, de propósito
    if (status === 429) return falha("LIMITE", "Muitas tentativas.");
    if (status === 400 || status === 401 || status === 422) return falha("NAO_AUTENTICADO", "Credenciais não conferem.");
    return falha("INDISPONIVEL", "Serviço de entrada indisponível.");
  }
  logger.info("auth.entrada", { ok: true });
  redirect("/painel");
}
