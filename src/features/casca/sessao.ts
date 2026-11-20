import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel } from "./abas";

// O que a casca mostra: clínica, pessoa, papel e o contador do sino, só da sessão real (regra do stage: nada de
// demonstração). Pessoa pelo full_name do usuário e papel pelo token (hook do MIG-03). O nome da clínica pela RLS e o
// contador do sino entram no MIG-03b e no MIG-45. Nada aqui autoriza: quem autoriza é a RLS com o papel do token.
export type SessaoDoPainel = { clinica: string | null; pessoa: { nome: string }; papel: Papel | null; notificacoes: number };

const PAPEIS: Record<string, Papel> = { ADMIN: "ADMIN", COLABORADOR: "COLABORADOR" };

export async function sessaoDoPainel(): Promise<SessaoDoPainel | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const meta = (claims.user_metadata ?? {}) as { full_name?: unknown };
  const papel = typeof claims.app_role === "string" ? (PAPEIS[claims.app_role.toUpperCase()] ?? null) : null;
  return {
    clinica: null,
    pessoa: { nome: typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : "" },
    papel,
    notificacoes: 0,
  };
}
