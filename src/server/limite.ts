/**
 * Limitador de tentativas único (ADR 0004 §2; proposta do Backend 6, aceita pelo Tech Lead em 20/11).
 * O contador fica no banco (`api.rate_limit_hit`, só service_role), porque a Vercel não garante a mesma instância.
 * A chave nunca é o valor cru: HMAC-SHA256 com ATTA_CPF_PEPPER e o rótulo `atta.ratelimit.v1|<bucket>|<valor>`.
 * sha256 simples não serve (IPv4 se reverte por força bruta). Trocar o pepper só zera contadores de janela curta.
 *
 * Uso numa server action ou route handler, antes de qualquer outra coisa:
 *   const limite = await consumirLimite(LIMITES.verificacaoPublicaPorIp, ip);
 *   if (!limite.ok) return limite;   // LIMITE (429)
 * Sem IP (desenvolvimento local), os pedidos dividem um contador só, "sem-valor": o limite continua valendo. Em
 * produção e preview, isso vira um aviso no log (`limite.sem_valor`).
 * O IP é o do usuário que o #58 resolve (1º x-forwarded-for da Vercel, validado), nunca um cabeçalho do navegador.
 * Erro do banco também nega (falha fechada): o limite não some quando o banco oscila.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pepperFromEnv } from "@/server/crypto/pepper";

export type PoliticaDeLimite = Readonly<{ bucket: string; limite: number; janelaSegundos: number }>;

/** As políticas, num lugar só. Mudou o PDD ou a ADR, muda aqui. */
export const LIMITES = {
  /** Verificação pública do Código ATTA: 30 por minuto por IP (ADR 0006 §6 do atta-platform; PDD v206 §18.6). */
  verificacaoPublicaPorIp: { bucket: "verify.ip", limite: 30, janelaSegundos: 60 },
  /** Verificação pública, teto da rota inteira: protege o banco de um ataque distribuído (Tech Lead no #114). */
  verificacaoPublicaGlobal: { bucket: "verify.global", limite: 600, janelaSegundos: 60 },
  /** Check-in, `iniciar`: 10 por IP a cada 10 min (ADR 0004 §2). */
  checkinIniciarPorIp: { bucket: "checkin.start.ip", limite: 10, janelaSegundos: 600 },
  /** Check-in, `iniciar`: 100 por portal a cada 10 min (ADR 0004 §2). */
  checkinIniciarPorPortal: { bucket: "checkin.start.portal", limite: 100, janelaSegundos: 600 },
  /** Convite de Equipe & Permissões: 20 por hora por gestor (MIG-06; Tech Lead e Segurança, revisão do #105). */
  conviteEquipePorUsuario: { bucket: "team.invite.user", limite: 20, janelaSegundos: 3600 },
  /** Convite de Equipe & Permissões: 50 por dia por clínica (MIG-06; revisão do #105). */
  conviteEquipePorClinica: { bucket: "team.invite.tenant", limite: 50, janelaSegundos: 86400 },
  /** PROpass, envio dos dados e conferência do conselho: 10 por hora por IP. Junto da revogação do link na 5ª recusa
   * (api.propass_submit), impede que o link vire oráculo de CPF (Tech Lead e Segurança, revisão do #129). */
  propassEnvioPorIp: { bucket: "propass.submit.ip", limite: 10, janelaSegundos: 3600 },
  /** Boarding Check, PIN: 20 tentativas a cada 15 min por IP, antes do subject e do confirm (Segurança e TL no #273).
   * O limite por link (5 seguidas: 15 min; 10: revoga) fica no banco; este impede varrer muitos links do mesmo IP. */
  boardingPinPorIp: { bucket: "boarding.pin.ip", limite: 20, janelaSegundos: 900 },
} as const satisfies Record<string, PoliticaDeLimite>;

const ROTULO = "atta.ratelimit.v1|";
const BUCKET = /^[a-z][a-z0-9_.]{2,63}$/;
const SEM_VALOR = "sem-valor";

/** HMAC da chave com pepper explícito (testes e rotação). */
export function chaveDoLimiteWith(pepper: Uint8Array, bucket: string, valor: string | null | undefined): Buffer {
  if (!BUCKET.test(bucket)) throw new RangeError("bucket fora do formato");
  if (pepper.length < 32) throw new RangeError("pepper precisa de pelo menos 32 bytes");
  const v = typeof valor === "string" && valor.trim() !== "" ? valor.trim() : SEM_VALOR;
  return createHmac("sha256", pepper).update(`${ROTULO}${bucket}|${v}`, "utf8").digest();
}

export function chaveDoLimite(bucket: string, valor: string | null | undefined): Buffer {
  return chaveDoLimiteWith(pepperFromEnv("ATTA_CPF_PEPPER"), bucket, valor);
}

/** O mínimo do cliente que o limitador usa: permite testar sem o Supabase. */
export type ClienteDoLimite = {
  schema(nome: "api"): {
    rpc(
      fn: "rate_limit_hit",
      args: { p_bucket: string; p_key_hash: string; p_limit: number; p_window_seconds: number },
    ): PromiseLike<{ data: boolean | null; error: { code?: string; message?: string; details?: string } | null }>;
  };
};

/** Conta um pedido. `ok` dentro do limite; `LIMITE` quando passa; erro do banco também nega. */
export async function consumirLimite(
  politica: PoliticaDeLimite,
  valor: string | null | undefined,
  cliente?: ClienteDoLimite,
): Promise<Resultado<null>> {
  // Fora do desenvolvimento, IP ausente é defeito de borda: todos caem no contador "sem-valor" e um atacante trava a
  // rota de todo mundo. Fica no log, sem valor nenhum (revisão do Tech Lead e do Backend 3 no #65).
  if ((typeof valor !== "string" || valor.trim() === "") && ["production", "preview"].includes(process.env.VERCEL_ENV ?? "")) {
    logger.warn("limite.sem_valor", { bucket: politica.bucket, ambiente: process.env.VERCEL_ENV });
  }
  let chave: Buffer;
  try {
    chave = chaveDoLimite(politica.bucket, valor);
  } catch {
    return falha("INTERNO", MENSAGENS.INTERNO);
  }
  const c = cliente ?? (criarClienteAdmin() as unknown as ClienteDoLimite);
  const { data, error } = await c.schema("api").rpc("rate_limit_hit", {
    p_bucket: politica.bucket,
    p_key_hash: `\\x${chave.toString("hex")}`, // bytea pelo PostgREST: hex com \x
    p_limit: politica.limite,
    p_window_seconds: politica.janelaSegundos,
  });
  if (error) return falhaDoBanco(error);
  return data === true ? ok(null) : falha("LIMITE", MENSAGENS.LIMITE);
}
