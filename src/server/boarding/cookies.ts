import "server-only";
import { cookies } from "next/headers";
import { hashDoSegredo } from "@/server/grant/politica";

// Cookie do link do Boarding Check (ADR 0004 §3, trava 1): atta_boarding_link guarda o segredo do link, gravado pelo
// GET /b/<segredo> sem consumir; 10 min, só em /boarding, HttpOnly, SameSite=Lax, sem Domain, Secure em https (como o
// atta_grant: fixo, quebraria o http://127.0.0.1 local no Safari). A sessão depois do PIN é o atta_grant do
// src/server/grant/cookie.ts (MIG-13a), dono único desse cookie.
export const COOKIE_LINK = "atta_boarding_link";
const CAMINHO = "/boarding";

export const opcoesDoCookieDoLink = (https: boolean) =>
  ({ httpOnly: true, secure: https, sameSite: "lax", path: CAMINHO, maxAge: 10 * 60 }) as const;

/** sha256 do segredo do link, ou null sem cookie ou fora do formato (sem ir ao banco). */
export async function lerHashDoLink(): Promise<Buffer | null> {
  const valor = (await cookies()).get(COOKIE_LINK)?.value;
  return valor ? hashDoSegredo(valor) : null;
}

/** Com o PIN certo, o banco já consumiu o segredo do link; o cookie sai também. */
export async function apagarLink(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_LINK, path: CAMINHO });
}
