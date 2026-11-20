import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import { consumirLimite, LIMITES, type ClienteDoLimite, type PoliticaDeLimite } from "@/server/limite";
import type { Convite } from "@/features/equipe/schema";

// Convite de Equipe & Permissões (PDD v206 §10.4.3; MIG-06). Nesta ordem:
//  1. Antes da secret key (ADR 0001 §4): sessão de ADMIN com aal2 e clínica no token E vínculo ADMIN ativo no banco,
//     lido com a sessão (a RLS só mostra o próprio vínculo ativo): ADMIN suspenso ou removido com token ainda válido
//     não chega à secret key (Segurança, #105).
//  2. Limite de convites (src/server/limite.ts): 20/h por gestor e 50/dia por clínica, senão LIMITE. Sem isso, o
//     CONFLITO de conta existente viraria oráculo de e-mail e daria para criar contas em massa (Tech Lead, #105).
//  3. auth.admin.inviteUserByEmail: cria o usuário e manda o e-mail (modelo invite.html → /auth/confirm do Backend 1).
//  4. api.team_invite com a sessão do gestor: o banco confere tenant, team/create, limite de 2 ADMIN e conta
//     recém-convidada, cria o vínculo e grava na trilha. Se recusar, a conta recém-criada é apagada (auth.admin.deleteUser):
//     conta sem clínica e com link de definir senha seria o cadastro aberto de volta (Tech Lead, #105).
//  5. app_metadata.atta_convite = id do vínculo (só o admin muda app_metadata): o definirSenha do Backend 1 (#111) lê o
//     claim e chama api.team_accept_invite antes de renovar a sessão. O id é um uuid opaco, não é dado pessoal.
// Log só com o desfecho, nunca com o e-mail ou o nome.

export type ClientesDoConvite = {
  servidor: SupabaseClient<Database>;
  admin: SupabaseClient<Database>;
  /** Para teste; o padrão é o limitador do banco com o cliente admin. */
  limitar?: (politica: PoliticaDeLimite, valor: string) => Promise<Resultado<null>>;
};

export async function convidarMembro(
  convite: Convite,
  clientes: ClientesDoConvite,
): Promise<Resultado<{ vinculo: string }>> {
  const { servidor, admin } = clientes;
  const limitar =
    clientes.limitar ?? ((p, v) => consumirLimite(p, v, admin as unknown as ClienteDoLimite));

  const { data: sessao } = await servidor.auth.getClaims();
  const claims = sessao?.claims;
  if (!claims?.sub) return falha("NAO_AUTENTICADO", MENSAGENS.NAO_AUTENTICADO);
  const tenant = typeof claims["tenant_id"] === "string" ? claims["tenant_id"] : null;
  if (claims["app_role"] !== "ADMIN" || claims["aal"] !== "aal2" || !tenant) {
    return falha("SEM_PERMISSAO", MENSAGENS.SEM_PERMISSAO);
  }
  const { data: vinculoDoGestor, error: erroDoVinculo } = await servidor
    .schema("platform")
    .from("membership")
    .select("app_role, status")
    .eq("user_id", claims.sub)
    .eq("tenant_id", tenant)
    .is("deleted_at", null)
    .maybeSingle();
  if (erroDoVinculo) return falhaDoBanco(erroDoVinculo);
  if (vinculoDoGestor?.app_role !== "ADMIN" || vinculoDoGestor.status !== "active") {
    return falha("SEM_PERMISSAO", MENSAGENS.SEM_PERMISSAO);
  }

  for (const [politica, valor] of [
    [LIMITES.conviteEquipePorUsuario, claims.sub],
    [LIMITES.conviteEquipePorClinica, tenant],
  ] as const) {
    const limite = await limitar(politica, valor);
    if (!limite.ok) return limite;
  }

  const { data: criado, error: erroDoConvite } = await admin.auth.admin.inviteUserByEmail(convite.email, {
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
  const usuario = criado.user.id;

  const { data: vinculo, error: erroDoBanco } = await servidor.schema("api").rpc("team_invite", {
    p_user_id: usuario,
    p_app_role: convite.papel,
    ...(convite.permissoes ? { p_permissions: convite.permissoes } : {}),
  });
  if (erroDoBanco || typeof vinculo !== "string") {
    const { error: erroAoApagar } = await admin.auth.admin.deleteUser(usuario);
    if (erroAoApagar) logger.warn("equipe.convite_conta_orfa", { code: erroAoApagar.code ?? "desconhecido" });
    return erroDoBanco ? falhaDoBanco(erroDoBanco) : falha("INTERNO", MENSAGENS.INTERNO);
  }

  const { error: erroDaMarca } = await admin.auth.admin.updateUserById(usuario, {
    app_metadata: { atta_convite: vinculo },
  });
  // sem a marca, o aceite automático não acontece; o vínculo fica Pendente e o "Reenviar convite" resolve
  if (erroDaMarca) logger.warn("equipe.convite_marca_falhou", { code: erroDaMarca.code ?? "desconhecido" });

  return ok({ vinculo });
}
