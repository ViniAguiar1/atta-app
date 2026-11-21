import "server-only";

import type { Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaImportacao, type SituacaoImportacao } from "@/server/importacao/porta";

/** Situação da importação (cota, preços, importações enviadas), lida no servidor com a sessão do painel. */
export async function carregarImportacao(): Promise<Resultado<SituacaoImportacao>> {
  const r = await portaImportacao.situacao();
  if (!r.ok) logger.warn("importacao.situacao_falhou", { code: r.error.code });
  return r;
}

/** Hoje (AAAA-MM-DD) no fuso das clínicas, para a cota dos 3 meses; o fuso de cada clínica entra com a assinatura (MIG-32). */
export const hojeNoFuso = (fuso = "America/Sao_Paulo") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
