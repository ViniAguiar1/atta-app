import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { envPublico } from "@/lib/env";

// Proxy do Next 16 (o antigo middleware): por enquanto só renova a sessão do Supabase no cookie a cada requisição.
// As guardas de rota e de papel entram no MIG-03.
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
  await supabase.auth.getClaims();
  return resposta;
}

export const config = {
  // fora: estáticos, imagens e a página de saúde, que não depende de sessão
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
