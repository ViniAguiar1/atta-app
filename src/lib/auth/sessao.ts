// Tempo da sessão do painel, num lugar só (PDD v206 §19.8; tempos do dono em 20/11; ADR 0006): 30 min sem atividade e no
// máximo 12 h desde o login. O [auth.sessions] do Supabase exige plano pago; até lá a regra vive aqui (proxy) e as 12 h
// também no banco (has_permission). Com plano pago, volta para o config.toml.
export const INATIVIDADE_MAXIMA_S = 30 * 60;
export const SESSAO_MAXIMA_S = 12 * 60 * 60;
export const COOKIE_ATIVIDADE = "atta_atividade";

type Claims = { amr?: unknown } | null | undefined;

/** O login da sessão: o mais antigo de amr[].timestamp (senha antes do TOTP). Sem amr, null. */
export function inicioDoLogin(claims: Claims): number | null {
  if (!claims || !Array.isArray(claims.amr)) return null;
  const tempos = claims.amr
    .map((e) => (e && typeof e === "object" ? (e as { timestamp?: unknown }).timestamp : undefined))
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  return tempos.length ? Math.min(...tempos) : null;
}

/**
 * A sessão venceu? Falha fechada: sem hora de login, ou sem cookie de atividade válido, vence. Mais de 12 h desde o
 * login, ou mais de 30 min desde a última requisição autenticada, vence.
 */
export function sessaoVencida(claims: Claims, ultimaAtividade: string | undefined, agora: number): boolean {
  const login = inicioDoLogin(claims);
  if (login === null || agora - login > SESSAO_MAXIMA_S) return true;
  const ultima = ultimaAtividade && /^[0-9]{1,12}$/.test(ultimaAtividade) ? Number(ultimaAtividade) : null;
  return ultima === null || agora - ultima > INATIVIDADE_MAXIMA_S;
}

export const agoraEmSegundos = () => Math.floor(Date.now() / 1000);
