"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { destinoSeguro } from "@/lib/auth/rotas";
import { type Resultado, falha, falhaDeValidacao, ok } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { registrarAcesso } from "@/server/auditoria/acesso";
import { criarClienteServidor } from "@/lib/supabase/server";

export type Ativacao = { factorId: string; qr: string; segredo: string };

// Primeira vez: cria o fator TOTP e devolve o QR (imagem data: do próprio Supabase) e a chave. Fatores não confirmados
// de tentativas anteriores saem antes, para não acumular. Tudo no servidor: o navegador não tem a sessão (HttpOnly).
export async function iniciarAtivacao(): Promise<Resultado<Ativacao>> {
  const supabase = await criarClienteServidor();
  const { data: fatores, error: erroLista } = await supabase.auth.mfa.listFactors();
  if (erroLista) return falha("NAO_AUTENTICADO", "Sua sessão terminou. Entre de novo.");
  if (fatores.totp.some((f) => f.status === "verified")) return falha("CONFLITO", "O autenticador já está ativo nesta conta.");
  for (const f of fatores.all.filter((f) => f.factor_type === "totp" && f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "ATTA" });
  if (error || !data) {
    logger.warn("auth.totp_ativacao_falhou", { code: error?.code ?? "sem_dados" });
    return falha("INDISPONIVEL", "Não foi possível gerar o QR agora. Tente de novo.");
  }
  return ok({ factorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
}

const confirmacao = z.object({
  factorId: z.uuid(),
  codigo: z.string().regex(/^[0-9]{6}$/),
  volta: z.string().max(500).optional(),
});

// Confere o código do app autenticador. Certo: a sessão sobe para aal2 (o cookie novo sai nesta resposta) e volta ao
// painel. Errado: "Código incorreto." (texto do simulador).
export async function confirmarCodigo(_anterior: Resultado<never> | null, dados: FormData): Promise<Resultado<never>> {
  const lido = confirmacao.safeParse({
    factorId: dados.get("factorId"),
    codigo: String(dados.get("codigo") ?? "").replace(/\D/g, ""),
    volta: dados.get("volta") ?? undefined,
  });
  if (!lido.success) return falhaDeValidacao(lido.error.issues);
  const supabase = await criarClienteServidor();
  // primeira confirmação deste fator = ativação; as seguintes = 2º fator no login (S3-5)
  const { data: fatores } = await supabase.auth.mfa.listFactors();
  const ativacao = fatores?.all.find((f) => f.id === lido.data.factorId)?.status !== "verified";
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: lido.data.factorId, code: lido.data.codigo });
  if (error) {
    logger.warn("auth.totp_recusado", { code: error.code ?? "desconhecido" });
    return error.status === 429
      ? falha("LIMITE", "Muitas tentativas. Espere alguns minutos e tente de novo.")
      : falha("NAO_AUTENTICADO", "Código incorreto.");
  }
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) await registrarAcesso(ativacao ? "auth.mfa_enrolled" : "auth.mfa_verified", data.claims.sub, { method: "totp" }, await headers());
  redirect(destinoSeguro(lido.data.volta));
}
