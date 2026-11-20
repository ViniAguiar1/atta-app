import "server-only";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Login, falha de login, 2º fator, sair e sessão encerrada na trilha (auditoria de segurança S3-5; ADR 0003 §1b). Só o
// servidor grava (api.audit_auth_event, EXECUTE só para service_role), depois de conferir a sessão: quem chama passa o
// sub verificado pelo getClaims, nunca um id que veio do navegador. Falhar aqui não derruba o login: só registra no log.
// `recebidos` são os cabeçalhos da requisição (await headers() nas actions; os já preparados pelo proxy): deles saem o
// x-atta-client-ip e o x-request-id que o record_event grava (src/lib/http/correlacao.ts). Sem eles, o evento fica sem IP.
export type AcaoDeAcesso =
  | "auth.login"
  | "auth.login_failed"
  | "auth.mfa_enrolled"
  | "auth.mfa_verified"
  | "auth.logout"
  | "auth.session_expired";

export type DetalhesDeAcesso = Partial<Record<"method" | "aal" | "reason", string>>;

export async function registrarAcesso(
  acao: AcaoDeAcesso,
  usuario: string | null,
  detalhes: DetalhesDeAcesso,
  recebidos: Headers,
): Promise<void> {
  try {
    const { error } = await criarClienteAdmin(recebidos)
      .schema("api")
      .rpc("audit_auth_event", { p_action: acao, p_user_id: usuario ?? undefined, p_details: detalhes });
    if (error) logger.warn("auditoria.acesso_nao_gravado", { acao, code: error.code });
  } catch {
    logger.warn("auditoria.acesso_nao_gravado", { acao, code: "excecao" });
  }
}
