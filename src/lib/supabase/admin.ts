import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublico } from "@/lib/env";
import { envServidor } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/database.types";

// Cliente com a secret key: passa por cima da RLS. Só em src/server/**, **/actions.ts e app/**/route.ts (regra do
// ESLint), e quem chama confere o papel e o tenant antes (ADR 0001 §4). Nunca chega ao navegador (server-only).
export function criarClienteAdmin() {
  return createClient<Database>(envPublico().NEXT_PUBLIC_SUPABASE_URL, envServidor().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
