"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decidirGuarda, PREFIXO_PAINEL, ROTA_LOGIN } from "@/lib/auth/rotas";
import { senhaNova } from "@/lib/auth/senha";
import { falha, falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import { registrarAcesso } from "@/server/auditoria/acesso";

const entrada = z.object({ senha: senhaNova, confirmacao: z.string() }).refine((d) => d.senha === d.confirmacao, {
  path: ["confirmacao"],
  message: "diferente",
});

// Grava a senha nova de quem chegou pelo link do e-mail (recuperação ou convite). A sessão veio do /auth/confirm.
// Depois, o destino passa pela guarda (o ADMIN vai antes ao 2º fator; conta sem clínica, a /sem-clinica).
export async function definirSenha(_anterior: Resultado<never> | null, dados: FormData): Promise<Resultado<never>> {
  const lido = entrada.safeParse({ senha: dados.get("senha"), confirmacao: dados.get("confirmacao") });
  if (!lido.success) return falhaDeValidacao(lido.error.issues);
  const supabase = await criarClienteServidor();
  const { data: sessao } = await supabase.auth.getClaims();
  if (!sessao?.claims) redirect(`${ROTA_LOGIN}?erro=link`);
  const { error } = await supabase.auth.updateUser({ password: lido.data.senha });
  if (error) {
    logger.warn("auth.senha_recusada", { code: error.code ?? "desconhecido" });
    if (error.code === "same_password") return falha("CONFLITO", "A senha nova precisa ser diferente da anterior.");
    if (error.code === "weak_password") return falha("VALIDACAO", "Use 12 ou mais caracteres, com letras e números.");
    return falha("INDISPONIVEL", "Não foi possível gravar a senha agora. Tente de novo.");
  }
  logger.info("auth.senha_definida", { ok: true });
  // convite: o servidor do convite (MIG-06) grava o id do vínculo em app_metadata.atta_convite (só o admin escreve).
  // Aceitar antes de renovar: o hook só dá a clínica a vínculo ativo. Falhou (gestor adicional ainda pendente, vínculo
  // já aceito), segue para a guarda.
  const convite = (sessao.claims.app_metadata as { atta_convite?: unknown } | undefined)?.atta_convite;
  if (typeof convite === "string" && /^[0-9a-f-]{36}$/.test(convite)) {
    const { error: erroAceite } = await supabase.schema("api").rpc("team_accept_invite", { p_membership_id: convite });
    if (erroAceite) logger.warn("auth.convite_nao_aceito", { code: erroAceite.code, detalhe: erroAceite.details });
  }
  await registrarAcesso("auth.password_reset", sessao.claims.sub, { reason: typeof convite === "string" ? "convite" : "recuperacao" }, await headers());
  // a renovação pega o vínculo mais novo (convite aceito) para o hook pôr a clínica no token
  await supabase.auth.refreshSession();
  const { data } = await supabase.auth.getClaims();
  redirect(decidirGuarda(PREFIXO_PAINEL, "", data?.claims) ?? PREFIXO_PAINEL);
}
