import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel } from "./abas";

// O que a casca mostra: clínica, pessoa, papel e o contador do sino, só da sessão real (regra do stage: nada de
// demonstração). Clínica pela RLS (a do token, com vínculo ativo), pessoa pelo full_name do usuário e papel pelo token
// (hook do MIG-03). O contador do sino entra no MIG-45. Nada aqui autoriza: quem autoriza é a RLS.
// permissoes: as linhas da própria matriz do Colaborador ("módulo.ação", MIG-06), que a RLS de platform.membership_permission
// deixa cada vínculo ler ("a tela decide as abas"); o ADMIN não usa a matriz e fica com a lista vazia.
export type SessaoDoPainel = { clinica: string | null; pessoa: { nome: string }; papel: Papel | null; permissoes: string[]; notificacoes: number };

const PAPEIS: Record<string, Papel> = { ADMIN: "ADMIN", COLABORADOR: "COLABORADOR" };

export async function sessaoDoPainel(): Promise<SessaoDoPainel | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return null;
  const { data: clinica } = await supabase.schema("platform").from("tenant").select("name").maybeSingle();
  const meta = (claims.user_metadata ?? {}) as { full_name?: unknown };
  const papel = typeof claims.app_role === "string" ? (PAPEIS[claims.app_role] ?? null) : null;
  const permissoes = papel === "COLABORADOR" ? await matrizDoColaborador(supabase) : [];
  return {
    clinica: clinica?.name ?? null,
    pessoa: { nome: typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : "" },
    papel,
    permissoes,
    notificacoes: 0,
  };
}

// Falha fechada: erro na leitura vira lista vazia (o Colaborador fica só com as abas de operação).
async function matrizDoColaborador(supabase: Awaited<ReturnType<typeof criarClienteServidor>>): Promise<string[]> {
  const { data, error } = await supabase.schema("platform").from("membership_permission").select("module, action");
  if (error || !data) return [];
  return data.map((linha) => `${linha.module}.${linha.action}`);
}
