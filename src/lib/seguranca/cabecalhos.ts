// Cabeçalhos de segurança de toda resposta (auditoria de segurança S2-1; PDD v206 §19.3; ADR 0004 §3). Num lugar só,
// aplicados pelo next.config.ts. Sem import do app: o next.config carrega este arquivo antes do build.
//
// CSP sem nonce, de propósito: o app usa cacheComponents (Partial Prerendering), e o guia do Next 16
// (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Static vs Dynamic Rendering with CSP")
// diz que nonce exige render dinâmico e é incompatível com PPR. Por isso o script inline do próprio Next fica com
// 'unsafe-inline'. O resto fecha: nada de outra origem (script, estilo, fonte, conexão, frame), nada de plugin, de
// <base> nem de formulário para fora, e ninguém embute o app num frame (clickjacking da tela de entrar e do 2º fator).
// O navegador não fala com o Supabase (sessão em cookie HttpOnly, ADR 0001 §4), então connect-src é só 'self'.

type Cabecalho = { key: string; value: string };
export type RegraDeCabecalhos = { source: string; headers: Cabecalho[] };

/** Origem (esquema + host + porta) de uma URL, ou null se não for URL http(s). */
function origemDe(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * A CSP. `desenvolvimento` libera o eval e o websocket do recarregamento do `next dev`, nunca no build de produção.
 * `supabaseUrl` entra só no form-action: o login com o Google (quando entrar) termina num redirect de formulário para o
 * Auth do Supabase.
 */
export function politicaDeConteudo(opcoes: { desenvolvimento: boolean; supabaseUrl?: string }): string {
  const supabase = origemDe(opcoes.supabaseUrl);
  const diretivas: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(opcoes.desenvolvimento ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"], // o QR do 2º fator vem como data: do Supabase
    "font-src": ["'self'"], // next/font serve as fontes do próprio app (/_next/static/media)
    "connect-src": ["'self'", ...(opcoes.desenvolvimento ? ["ws:"] : [])],
    "frame-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'", ...(supabase ? [supabase] : [])],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(diretivas)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`)
    .join("; ");
}

/** Rotas cujo caminho leva segredo (link do profissional e do PROpass, ADR 0004 §3): nada de Referer, cache ou índice. */
export const ROTAS_COM_SEGREDO = ["/b/:path*", "/boarding", "/boarding/:path*", "/propass", "/propass/:path*"] as const;

export function cabecalhosDeSeguranca(opcoes: { desenvolvimento: boolean; supabaseUrl?: string }): RegraDeCabecalhos[] {
  const gerais: Cabecalho[] = [
    { key: "Content-Security-Policy", value: politicaDeConteudo(opcoes) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  const deSegredo: Cabecalho[] = [
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cache-Control", value: "no-store" },
    { key: "X-Robots-Tag", value: "noindex, nofollow" },
  ];
  // No next.config, quando duas regras casam e repetem a chave, vale a última: as de segredo vêm depois das gerais.
  return [{ source: "/:path*", headers: gerais }, ...ROTAS_COM_SEGREDO.map((source) => ({ source, headers: deSegredo }))];
}
