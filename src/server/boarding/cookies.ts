import "server-only";
import { cookies } from "next/headers";

// Cookies do Boarding Check (ADR 0004 §3). Todos HttpOnly, SameSite=Lax, sem Domain (ficam só no host).
// - atta_boarding_link: o segredo do link, gravado pelo GET /b/<segredo> sem consumir; 10 min, só em /boarding.
// - atta_grant: a sessão do profissional depois do PIN certo. Quando o #30 (MIG-13a) entrar, a sessão passa a usar
//   gravarGrant/lerHash/apagarGrant de src/server/grant/cookie.ts, com a validade do grant (8 h do envio).
export const COOKIE_LINK = "atta_boarding_link";
export const VALIDADE_LINK_S = 10 * 60;
const COOKIE_SESSAO = "atta_grant";
const VALIDADE_SESSAO_S = 8 * 60 * 60; // teto do link (RN-FIC-07); o banco decide antes, na conclusão ou no cancelamento

/** 32 bytes em base64url: o formato do segredo do grant. Fora dele, o segredo nem chega à porta. */
export const formatoDoSegredo = /^[A-Za-z0-9_-]{43}$/;

// Secure sempre, como a sessão simulada do check-in: o navegador aceita em https e em localhost.
export const OPCOES_DO_COOKIE_DO_LINK = { httpOnly: true, secure: true, sameSite: "lax", path: "/boarding", maxAge: VALIDADE_LINK_S } as const;

const valido = (valor: string | undefined) => (valor && formatoDoSegredo.test(valor) ? valor : null);

export async function lerLink(): Promise<string | null> {
  return valido((await cookies()).get(COOKIE_LINK)?.value);
}

export async function lerSessao(): Promise<string | null> {
  return valido((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** PIN certo: o link sai e a sessão entra (o banco já consumiu o segredo do link na mesma transação). */
export async function trocarLinkPorSessao(segredoDaSessao: string) {
  const jar = await cookies();
  jar.delete({ name: COOKIE_LINK, path: "/boarding" });
  jar.set(COOKIE_SESSAO, segredoDaSessao, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: VALIDADE_SESSAO_S });
}
