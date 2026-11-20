import "server-only";
import { cookies, headers } from "next/headers";
import { COOKIE_GRANT, type Finalidade, gerarSegredo, hashDoSegredo, opcoesDoCookie } from "./politica";

/**
 * Cookie `atta_grant` das server actions do check-in e do Boarding Check. O segredo nunca vai para o banco: só o hash.
 * Quem emite chama `api.grant_issue` com o hash devolvido aqui; quem lê chama `api.grant_resolve` com `lerHash()`.
 */
export async function gravarGrant(finalidade: Finalidade): Promise<Buffer> {
  const segredo = gerarSegredo();
  const hash = hashDoSegredo(segredo);
  if (!hash) throw new Error("grant: segredo fora do formato");
  const https = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(COOKIE_GRANT, segredo, opcoesDoCookie(finalidade, https));
  return hash;
}

/** Hash do segredo do cookie, ou null sem cookie ou com cookie fora do formato (sem ir ao banco). */
export async function lerHash(): Promise<Buffer | null> {
  const valor = (await cookies()).get(COOKIE_GRANT)?.value;
  return valor ? hashDoSegredo(valor) : null;
}

export async function apagarGrant(): Promise<void> {
  (await cookies()).delete({ name: COOKIE_GRANT, path: "/" });
}
