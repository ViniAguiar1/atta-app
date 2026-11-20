"use server";

import { falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { apagarLink, lerHashDoLink } from "@/server/boarding/cookies";
import { portaBoarding } from "@/server/boarding/porta";
import { apagarGrant, gravarGrant } from "@/server/grant/cookie";
import { type DesfechoDoPin, minutosAte, pinSchema } from "./schema";

// Server action do PIN do Boarding Check (POST; o PIN vai no corpo). PDD §10.2.3; ADR 0004 §3, trava 2: só o PIN
// certo consome o segredo do link. O app gera o segredo da sessão (gravarGrant, MIG-13a) e o banco só recebe o hash;
// se o PIN não vale, o cookie da sessão sai na mesma resposta. Sem cookie do link, a resposta é a mesma de link vencido.
// Os limites (5 seguidos: 15 min; 10 no total: revoga) são do banco; a action só repassa. Log sem PIN nem segredo.
export async function confirmarPin(entrada: unknown): Promise<Resultado<DesfechoDoPin>> {
  const dados = pinSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const hashDoLink = await lerHashDoLink();
  if (!hashDoLink) return ok({ status: "indisponivel" });

  const hashDaSessao = await gravarGrant("professional_boarding");
  const r = await portaBoarding.confirmarPin(hashDoLink, dados.data.pin, hashDaSessao);
  logger.info("boarding.pin_conferido", { ok: r.ok, status: r.ok ? r.data.status : r.error.code });
  if (r.ok && r.data.status === "ok") {
    await apagarLink();
    return ok({ status: "ok" });
  }
  await apagarGrant();
  if (!r.ok) return r;
  if (r.data.status === "indisponivel") await apagarLink(); // o link não vale mais: o cookie sai na mesma resposta
  if (r.data.status === "bloqueado") return ok({ status: "bloqueado", minutos: minutosAte(r.data.bloqueadoAte) });
  return ok({ status: r.data.status });
}
