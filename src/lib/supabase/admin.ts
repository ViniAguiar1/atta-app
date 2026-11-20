import "server-only";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { envPublico } from "@/lib/env";
import { envServidor } from "@/lib/env.server";
import { cabecalhosParaOSupabase } from "@/lib/http/correlacao";
import type { Database } from "@/lib/supabase/database.types";

// Cliente com a secret key: passa por cima da RLS. Só em src/server/**, **/actions.ts e app/**/route.ts (regra do
// ESLint), e quem chama confere o papel e o tenant antes (ADR 0001 §4). Nunca chega ao navegador (server-only).
// Dentro de uma requisição, passe os cabeçalhos dela (await headers()): o id e o IP do usuário vão para a trilha
// (src/lib/http/correlacao.ts). Fora de requisição (job), sem cabeçalhos: vai só um id novo.
export function criarClienteAdmin(recebidos: Headers = new Headers()) {
  return createClient<Database>(envPublico().NEXT_PUBLIC_SUPABASE_URL, envServidor().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: cabecalhosParaOSupabase(recebidos, randomUUID, (v) => isIP(v) !== 0) },
  });
}
