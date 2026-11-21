import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { Papel } from "./abas";

// O que a casca mostra: clínica, pessoa, papel e o contador do sino, só da sessão real (regra do stage: nada de
// demonstração). Clínica pela RLS (a do token, com vínculo ativo), pessoa pelo full_name do usuário e papel pelo token
// (hook do MIG-03). O contador do sino entra no MIG-45. Nada aqui autoriza: quem autoriza é a RLS.
// permissoes: as linhas da matriz do PRÓPRIO vínculo do Colaborador ("módulo.ação", MIG-06); o ADMIN não usa a matriz e
// fica com a lista vazia. A RLS de platform.membership_permission devolve a própria matriz e, para quem tem team.view, a
// da clínica inteira: por isso o filtro explícito pelo vínculo do usuário (❌ da Segurança e do Frontend 2 no #201).
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
  const permissoes = papel === "COLABORADOR" && typeof claims.sub === "string" ? await matrizDoColaborador(supabase, claims.sub) : [];
  return {
    clinica: clinica?.name ?? null,
    pessoa: { nome: typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : "" },
    papel,
    permissoes,
    notificacoes: 0,
  };
}

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

/**
 * A matriz do próprio vínculo: primeiro o vínculo ativo do usuário nesta clínica (a RLS já fixa a clínica do token),
 * depois só as linhas dele. Falha fechada: erro, nenhum vínculo ou mais de um viram lista vazia (o Colaborador fica só
 * com as abas de operação). Quem autoriza de fato continua o has_permission no banco.
 */
export async function matrizDoColaborador(supabase: Cliente, userId: string): Promise<string[]> {
  const { data: vinculo, error: erroDoVinculo } = await supabase
    .schema("platform")
    .from("membership")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (erroDoVinculo || !vinculo) return [];
  const { data, error } = await supabase.schema("platform").from("membership_permission").select("module, action").eq("membership_id", vinculo.id);
  if (error || !data) return [];
  return data.map((linha) => `${linha.module}.${linha.action}`);
}
