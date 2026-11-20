import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { envPublico } from "@/lib/env";
import { cabecalhosParaOSupabase } from "@/lib/http/correlacao";
import { opcoesDoCookieDeSessao } from "@/lib/supabase/cookies";
import type { Database } from "@/lib/supabase/database.types";

// Cliente de servidor (Server Components, actions, route handlers): a sessão do usuário vem do cookie, então a RLS
// continua valendo. Em Server Component o set de cookie falha e é ignorado: quem renova a sessão é o proxy.ts.
export async function criarClienteServidor() {
  const env = envPublico();
  const loja = await cookies();
  const recebidos = await headers();
  const https = recebidos.get("x-forwarded-proto") === "https";
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    // id da requisição e IP do usuário em todo pedido, para a trilha de auditoria (src/lib/http/correlacao.ts)
    global: { headers: cabecalhosParaOSupabase(recebidos, randomUUID, (v) => isIP(v) !== 0) },
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, { ...options, ...opcoesDoCookieDeSessao(https) });
        } catch {
          // Server Component: não grava cookie; o proxy.ts já renovou a sessão nesta requisição
        }
      },
    },
  });
}
