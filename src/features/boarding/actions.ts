"use server";

import { falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { lerLink, trocarLinkPorSessao } from "@/server/boarding/cookies";
import { portaBoarding } from "@/server/boarding/porta";
import { type DesfechoDoPin, minutosAte, pinSchema } from "./schema";

// Server action do PIN do Boarding Check (POST; o PIN vai no corpo). PDD §10.2.3; ADR 0004 §3, trava 2: só o PIN
// certo consome o segredo do link, e ele vira a sessão (atta_grant) aqui. Sem cookie do link, a resposta é a mesma de
// link vencido. Os limites (5 seguidos: 15 min; 10 no total: revoga) são do banco; a action só repassa.
// Log só com o desfecho, sem PIN nem segredo.
export async function confirmarPin(entrada: unknown): Promise<Resultado<DesfechoDoPin>> {
  const dados = pinSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const link = await lerLink();
  if (!link) return ok({ status: "indisponivel" });

  const r = await portaBoarding.confirmarPin(link, dados.data.pin);
  logger.info("boarding.pin_conferido", { ok: r.ok, status: r.ok ? r.data.status : r.error.code });
  if (!r.ok) return r;
  switch (r.data.status) {
    case "ok":
      await trocarLinkPorSessao(r.data.segredoDaSessao);
      return ok({ status: "ok" });
    case "bloqueado":
      return ok({ status: "bloqueado", minutos: minutosAte(r.data.bloqueadoAte) });
    default:
      return ok({ status: r.data.status });
  }
}
