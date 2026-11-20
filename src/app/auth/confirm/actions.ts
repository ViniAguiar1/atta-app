"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROTA_DEFINIR_SENHA, ROTA_LOGIN } from "@/lib/auth/rotas";
import { agoraEmSegundos, COOKIE_ATIVIDADE } from "@/lib/auth/sessao";
import { logger } from "@/lib/logger";
import { opcoesDoCookieDeAtividade } from "@/lib/supabase/cookies";
import { criarClienteServidor } from "@/lib/supabase/server";
import { linkValido } from "./link";

// O botão da página do link: confere o token_hash no servidor (verifyOtp), abre a sessão no cookie e leva à nova
// senha. Link usado, vencido ou inválido volta ao login com uma mensagem só.
export async function confirmarLink(dados: FormData): Promise<void> {
  const tokenHash = dados.get("token_hash");
  const tipo = dados.get("type");
  if (!linkValido(tokenHash, tipo)) redirect(`${ROTA_LOGIN}?erro=link`);
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash as string });
  if (error) {
    logger.warn("auth.link_recusado", { code: error.code ?? "desconhecido" });
    redirect(`${ROTA_LOGIN}?erro=link`);
  }
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE_ATIVIDADE, String(agoraEmSegundos()), opcoesDoCookieDeAtividade(https));
  redirect(`${ROTA_DEFINIR_SENHA}?fluxo=${tipo === "invite" ? "convite" : "recuperar"}`);
}
