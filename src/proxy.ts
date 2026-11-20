import { createServerClient } from "@supabase/ssr";
import { after, type NextRequest, NextResponse } from "next/server";
import { decidirGuarda } from "@/lib/auth/rotas";
import { agoraEmSegundos, COOKIE_ATIVIDADE, inicioDoLogin, SESSAO_MAXIMA_S, sessaoVencida } from "@/lib/auth/sessao";
import { registrarAcesso } from "@/server/auditoria/acesso";
import { envPublico } from "@/lib/env";
import { prepararCabecalhosDaRequisicao } from "@/lib/http/correlacao";
import { opcoesDoCookieDeAtividade, opcoesDoCookieDeSessao } from "@/lib/supabase/cookies";

// Proxy do Next 16 (o antigo middleware): renova a sessão do Supabase no cookie a cada requisição e guarda as rotas.
// Só redireciona; quem autoriza o dado é a RLS (has_permission). Regras em decidirGuarda (src/lib/auth/rotas.ts).
export async function proxy(request: NextRequest) {
  const env = envPublico();
  const https = request.nextUrl.protocol === "https:";
  const cookieDaSessao = opcoesDoCookieDeSessao(https);
  // id da requisição gerado aqui (o do navegador é descartado) e sem IP vindo do navegador (src/lib/http/correlacao.ts)
  const idDaRequisicao = crypto.randomUUID();
  const seguir = () => NextResponse.next({ request: { headers: prepararCabecalhosDaRequisicao(request.headers, idDaRequisicao) } });
  let resposta = seguir();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        resposta = seguir();
        for (const { name, value, options } of lista) resposta.cookies.set(name, value, { ...options, ...cookieDaSessao });
      },
    },
  });
  // getClaims() confere a assinatura do JWT; não pôr código entre a criação do cliente e esta chamada
  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  let claims = data?.claims;
  if (claims) {
    const agora = agoraEmSegundos();
    if (sessaoVencida(claims, request.cookies.get(COOKIE_ATIVIDADE)?.value, agora)) {
      // 30 min sem atividade ou 12 h desde o login (src/lib/auth/sessao.ts): encerra esta sessão (revoga o refresh)
      await supabase.auth.signOut({ scope: "local" });
      resposta.cookies.delete(COOKIE_ATIVIDADE);
      // na trilha depois da resposta, sem atrasar o redirecionamento (S3-5)
      const login = inicioDoLogin(claims);
      const motivo = login === null || agora - login > SESSAO_MAXIMA_S ? "teto_12h" : "inatividade_30min";
      const usuario = claims.sub;
      if (usuario) after(() => registrarAcesso("auth.session_expired", usuario, { reason: motivo }));
      claims = undefined;
    } else {
      resposta.cookies.set(COOKIE_ATIVIDADE, String(agora), opcoesDoCookieDeAtividade(https));
    }
  }
  const destino = decidirGuarda(pathname, search, claims);
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
