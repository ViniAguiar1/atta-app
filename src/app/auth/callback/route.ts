import { type NextRequest, NextResponse } from "next/server";
import { destinoSeguro, ROTA_LOGIN } from "@/lib/auth/rotas";
import { agoraEmSegundos, COOKIE_ATIVIDADE } from "@/lib/auth/sessao";
import { logger } from "@/lib/logger";
import { opcoesDoCookieDeAtividade } from "@/lib/supabase/cookies";
import { criarClienteServidor } from "@/lib/supabase/server";

// Retorno do Google: troca o código pela sessão (cookie) e volta para um caminho interno. Redirecionamento relativo
// (303 com Location "/…"): o navegador resolve no host que ele mesmo usou, sem confiar no cabeçalho Host.
const irPara = (caminho: string) => new NextResponse(null, { status: 303, headers: { Location: caminho } });

export async function GET(request: NextRequest) {
  const codigo = request.nextUrl.searchParams.get("code");
  const volta = destinoSeguro(request.nextUrl.searchParams.get("volta"));
  if (codigo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) {
      const r = irPara(volta);
      r.cookies.set(COOKIE_ATIVIDADE, String(agoraEmSegundos()), opcoesDoCookieDeAtividade(request.nextUrl.protocol === "https:"));
      return r;
    }
    logger.warn("auth.callback_recusado", { code: error.code ?? "desconhecido" });
  }
  return irPara(`${ROTA_LOGIN}?erro=google`);
}
