import { createBrowserClient } from "@supabase/ssr";
import { envPublico } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

// Cliente do navegador: só a chave publicável; toda leitura passa pela RLS (ADR 0001 §2).
export function criarClienteNavegador() {
  const env = envPublico();
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
