"use server";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { envPublico } from "@/lib/env";
import { falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";

const pedido = z.object({ email: z.email().max(254) });

// "Esqueci a senha" (MIG-03c). A resposta é a mesma para e-mail que existe ou não (não revela conta), e também quando o
// Auth limita o envio: quem tem conta recebe o link. Log só com o desfecho, sem o e-mail.
// Sem PKCE, de propósito: com PKCE o link só abre no navegador que pediu (o verificador fica num cookie dele), e a
// pessoa costuma abrir o e-mail no celular. O link leva ao /auth/confirm, que confere o token_hash no servidor.
export async function pedirNovaSenha(_anterior: Resultado<null> | null, dados: FormData): Promise<Resultado<null>> {
  const lido = pedido.safeParse({ email: dados.get("email") });
  if (!lido.success) return falhaDeValidacao(lido.error.issues);
  const env = envPublico();
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(lido.data.email);
  logger.info("auth.recuperar_pedido", { ok: !error, status: error?.status ?? 200 });
  return ok(null);
}
