import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublico } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Cliente de servidor (Server Components, actions, route handlers): a sessão do usuário vem do cookie, então a RLS
// continua valendo. Em Server Component o set de cookie falha e é ignorado: quem renova a sessão é o proxy.ts.
export async function criarClienteServidor() {
  const env = envPublico();
  const loja = await cookies();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options);
        } catch {
          // Server Component: não grava cookie; o proxy.ts já renovou a sessão nesta requisição
        }
      },
    },
  });
}
