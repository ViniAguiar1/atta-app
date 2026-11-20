import { type NextRequest, NextResponse } from "next/server";
import { destinoSeguro, ROTA_LOGIN } from "@/lib/auth/rotas";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";

// Retorno do Google e dos links de e-mail: troca o código pela sessão (cookie) e volta para um caminho interno.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get("code");
  const volta = destinoSeguro(searchParams.get("volta"));
  if (codigo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(new URL(volta, origin));
    logger.warn("auth.callback_recusado", { code: error.code ?? "desconhecido" });
  }
  return NextResponse.redirect(new URL(`${ROTA_LOGIN}?erro=google`, origin));
}
