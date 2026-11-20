"use server";

import { falha, falhaDeValidacao, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { lerHashDoConvite } from "@/server/propass/cookies";
import { propassNoAr } from "@/server/propass/disponivel";
import { portaPropass } from "@/server/propass/porta";
import { type ConferenciaDoConselho, dadosSchema } from "./schema";

// Server action do passo 1 → 2 do PROpass (POST; CPF e WhatsApp só no corpo). PDD §10.4.3. Confere o formato no
// servidor e pede ao backend a situação do registro no conselho. Não grava nada: o envio (api.propass_submit) entra no
// PR do termo. Sem cookie do convite, a resposta é a mesma de link vencido. Log só com o desfecho.
export async function conferirDados(entrada: unknown): Promise<Resultado<ConferenciaDoConselho>> {
  if (!propassNoAr()) return falha("NAO_ENCONTRADO", "Não encontrado."); // porta simulada: fora da produção
  const dados = dadosSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const hash = await lerHashDoConvite();
  if (!hash) return ok({ situacao: "link_sem_validade" });

  const { conselho, numero, uf, nome } = dados.data;
  const r = await portaPropass.conferirConselho(hash, { conselho, numero, uf, nome });
  logger.info("propass.conselho_conferido", { ok: r.ok, situacao: r.ok ? r.data.situacao : r.error.code });
  if (!r.ok) return r.error.code === "NAO_ENCONTRADO" ? ok({ situacao: "link_sem_validade" }) : r;
  return ok(r.data);
}
