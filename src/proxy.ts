import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { envPublico } from "@/lib/env";

// Proxy do Next 16 (o antigo middleware): renova a sessão do Supabase no cookie a cada requisição e faz a guarda mínima
// de rota (regra do stage, ADR 0001 §4): "/" vai ao painel com sessão e à tela de entrar sem ela; /painel/** sem sessão
// vai para /login; /login com sessão vai ao painel. O MIG-03b (Backend 1) completa com o volta, o 2º fator e o papel.
export async function proxy(request: NextRequest) {
  const env = envPublico();
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
      },
    },
  });
  // getClaims() confere o JWT; não pôr código entre a criação do cliente e esta chamada (doc do @supabase/ssr)
  const { data } = await supabase.auth.getClaims();

  const caminho = request.nextUrl.pathname;
  const logado = Boolean(data?.claims);
  const doPainel = caminho === "/painel" || caminho.startsWith("/painel/");
  const destino =
    caminho === "/" ? (logado ? "/painel" : "/login") : !logado && doPainel ? "/login" : logado && caminho === "/login" ? "/painel" : null;
  if (!destino) return resposta;

  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = "";
  const redirecionamento = NextResponse.redirect(url);
  // leva junto o cookie de sessão renovado nesta requisição (doc do @supabase/ssr)
  for (const cookie of resposta.cookies.getAll()) redirecionamento.cookies.set(cookie);
  return redirecionamento;
}

export const config = {
  // fora: estáticos, imagens e a página de saúde, que não depende de sessão
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
