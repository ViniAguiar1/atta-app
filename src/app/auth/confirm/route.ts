import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { ROTA_DEFINIR_SENHA, ROTA_LOGIN } from "@/lib/auth/rotas";
import { agoraEmSegundos, COOKIE_ATIVIDADE } from "@/lib/auth/sessao";
import { origemPublica } from "@/lib/http/origem";
import { logger } from "@/lib/logger";
import { opcoesDoCookieDeAtividade } from "@/lib/supabase/cookies";
import { criarClienteServidor } from "@/lib/supabase/server";

// Link do e-mail de "Esqueci a senha" e do convite (MIG-03c): confere o token_hash no servidor (verifyOtp), abre a
// sessão no cookie e leva à tela de nova senha. Só os dois tipos que o app manda; qualquer outro, ou link usado ou
// vencido, volta ao login com uma mensagem só.
const TIPOS: ReadonlySet<EmailOtpType> = new Set(["recovery", "invite"]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const origin = origemPublica(request.headers, request.nextUrl);
  const tokenHash = searchParams.get("token_hash");
  const tipo = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash) && tipo && TIPOS.has(tipo)) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) {
      const r = NextResponse.redirect(new URL(`${ROTA_DEFINIR_SENHA}?fluxo=${tipo === "invite" ? "convite" : "recuperar"}`, origin));
      r.cookies.set(COOKIE_ATIVIDADE, String(agoraEmSegundos()), opcoesDoCookieDeAtividade(request.nextUrl.protocol === "https:"));
      return r;
    }
    logger.warn("auth.link_recusado", { code: error.code ?? "desconhecido" });
  }
  return NextResponse.redirect(new URL(`${ROTA_LOGIN}?erro=link`, origin));
}
