import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import type { Convite } from "@/features/equipe/schema";

// Convite de Equipe & Permissões (PDD v206 §10.4.3; MIG-06). Três passos, nesta ordem:
//  1. auth.admin.inviteUserByEmail (secret key): cria o usuário e manda o e-mail do convite (modelo invite.html, que leva
//     ao /auth/confirm do Backend 1). Antes de usar a secret key, confere a sessão de ADMIN com 2º fator (ADR 0001 §4);
//     quem decide de verdade é o banco no passo 2.
//  2. api.team_invite com a sessão do gestor: o banco confere tenant, permissão team/create, o limite de 2 ADMIN e que a
//     conta é recém-convidada; cria o vínculo (COLABORADOR invited; ADMIN pending_verification) e grava na trilha.
//  3. app_metadata.atta_convite = id do vínculo (só o admin muda app_metadata): o definirSenha do Backend 1 lê o claim e
//     chama api.team_accept_invite antes de renovar a sessão. O id é um uuid opaco, não é dado pessoal.
// Se o passo 2 falhar, sobra um usuário sem clínica, inofensivo (o hook não dá clínica a quem não tem vínculo ativo).
// Log só com o desfecho, nunca com o e-mail ou o nome.

export type ClientesDoConvite = {
  servidor: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
};

export async function convidarMembro(
  convite: Convite,
  clientes: ClientesDoConvite,
): Promise<Resultado<{ vinculo: string }>> {
  const { data: sessao } = await clientes.servidor.auth.getClaims();
  const claims = sessao?.claims;
  if (!claims) return falha("NAO_AUTENTICADO", MENSAGENS.NAO_AUTENTICADO);
  if (claims["app_role"] !== "ADMIN" || claims["aal"] !== "aal2" || !claims["tenant_id"]) {
    return falha("SEM_PERMISSAO", MENSAGENS.SEM_PERMISSAO);
  }

  const { data: criado, error: erroDoConvite } = await clientes.admin.auth.admin.inviteUserByEmail(convite.email, {
    data: convite.nome ? { full_name: convite.nome } : {},
  });
  if (erroDoConvite || !criado?.user) {
    // conta que já existe não ganha vínculo por aqui (o banco recusaria com not_invited; Segurança, #54)
    if (erroDoConvite?.code === "email_exists") {
      return falha("CONFLITO", MENSAGENS.CONFLITO, undefined, "ATTA-IN-0003:not_invited");
    }
    logger.warn("equipe.convite_auth_falhou", { code: erroDoConvite?.code ?? "sem_usuario" });
    return falha("INDISPONIVEL", MENSAGENS.INDISPONIVEL);
  }

  const { data: vinculo, error: erroDoBanco } = await clientes.servidor.schema("api").rpc("team_invite", {
    p_user_id: criado.user.id,
    p_app_role: convite.papel,
    ...(convite.permissoes ? { p_permissions: convite.permissoes } : {}),
  });
  if (erroDoBanco) return falhaDoBanco(erroDoBanco);
  if (typeof vinculo !== "string") return falha("INTERNO", MENSAGENS.INTERNO);

  const { error: erroDaMarca } = await clientes.admin.auth.admin.updateUserById(criado.user.id, {
    app_metadata: { atta_convite: vinculo },
  });
  // sem a marca, o aceite automático não acontece; o vínculo fica Pendente e o "Reenviar convite" resolve
  if (erroDaMarca) logger.warn("equipe.convite_marca_falhou", { code: erroDaMarca.code ?? "desconhecido" });

  return ok({ vinculo });
}
