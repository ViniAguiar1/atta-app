import "server-only";

import type { Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import { portaImportacao, type SituacaoImportacao } from "@/server/importacao/porta";

/** Situação da importação (cota, preços, importações enviadas), lida no servidor com a sessão do painel. */
export async function carregarImportacao(): Promise<Resultado<SituacaoImportacao>> {
  const r = await portaImportacao.situacao();
  if (!r.ok) logger.warn("importacao.situacao_falhou", { code: r.error.code });
  return r;
}

const FUSO_PADRAO = "America/Sao_Paulo"; // padrão de platform.tenant.timezone

const fusoValido = (fuso: string) => {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
};

/**
 * Fuso da clínica da sessão (platform.tenant.timezone, pela RLS: a clínica do token), para as datas da importação saírem
 * no fuso dela (ADR 0001 §4), como no Perfil, na Pasta e na Agenda. Sem linha ou com fuso inválido, o padrão da tabela.
 */
export async function fusoDaClinica(): Promise<string> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.schema("platform").from("tenant").select("timezone").maybeSingle();
  const fuso = data?.timezone;
  return typeof fuso === "string" && fusoValido(fuso) ? fuso : FUSO_PADRAO;
}

/** Hoje (AAAA-MM-DD) no fuso da clínica, para saber se a cota dos 3 meses ainda vale. */
export const hojeNoFuso = (fuso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
