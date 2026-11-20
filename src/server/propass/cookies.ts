import "server-only";
import { cookies } from "next/headers";
import { hashDoSegredo } from "@/server/grant/politica";

// Cookie do link do PROpass (ADR 0004 §3, como o do Boarding Check): atta_propass_link guarda o segredo do convite,
// gravado pelo GET /propass/<segredo> sem consumir. Só em /propass, HttpOnly, SameSite=Lax, sem Domain, Secure em
// https. Vale 1 h: o link (7 dias) continua no e-mail e grava de novo quando aberto.
export const COOKIE_LINK_PROPASS = "atta_propass_link";

export const opcoesDoCookieDoPropass = (https: boolean) =>
  ({ httpOnly: true, secure: https, sameSite: "lax", path: "/propass", maxAge: 60 * 60 }) as const;

/** sha256 do segredo do convite, ou null sem cookie ou fora do formato (sem ir ao banco). */
export async function lerHashDoConvite(): Promise<Buffer | null> {
  const valor = (await cookies()).get(COOKIE_LINK_PROPASS)?.value;
  return valor ? hashDoSegredo(valor) : null;
}
