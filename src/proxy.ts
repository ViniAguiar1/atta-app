import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { decidirGuarda } from "@/lib/auth/rotas";
import { envPublico } from "@/lib/env";
import { opcoesDoCookieDeSessao } from "@/lib/supabase/cookies";

// Proxy do Next 16 (o antigo middleware): renova a sessão do Supabase no cookie a cada requisição e guarda as rotas.
// Só redireciona; quem autoriza o dado é a RLS (has_permission). Regras em decidirGuarda (src/lib/auth/rotas.ts).
export async function proxy(request: NextRequest) {
  const env = envPublico();
  const cookieDaSessao = opcoesDoCookieDeSessao(request.nextUrl.protocol === "https:");
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, { ...options, ...cookieDaSessao });
      },
    },
  });
  // getClaims() confere a assinatura do JWT; não pôr código entre a criação do cliente e esta chamada
  const { data } = await supabase.auth.getClaims();
  const destino = decidirGuarda(request.nextUrl.pathname, request.nextUrl.search, data?.claims);
  return destino ? redirecionar(request, resposta, destino) : resposta;
}

// O redirecionamento leva os cookies que a renovação da sessão acabou de gravar.
function redirecionar(request: NextRequest, resposta: NextResponse, destino: string) {
  const r = NextResponse.redirect(new URL(destino, request.url));
  for (const cookie of resposta.cookies.getAll()) r.cookies.set(cookie);
  return r;
}

export const config = {
  // fora: estáticos, imagens e a página de saúde, que não depende de sessão
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
