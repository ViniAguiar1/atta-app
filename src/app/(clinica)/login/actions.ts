"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { decidirGuarda, destinoSeguro, ROTA_CALLBACK, ROTA_LOGIN } from "@/lib/auth/rotas";
import { falha, falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";

// Entrada com e-mail e senha (PDD v206 §9.4 e §10.4.3; MIG-03). POST pela server action: e-mail e senha nunca vão na
// URL. Log só com o desfecho, sem e-mail. Os textos ficam em textos.ts, pelo `code` (tela do Frontend).
const entradaSchema = z.object({ email: z.email().max(254), senha: z.string().min(1).max(200), volta: z.string().max(500).optional() });

export async function entrarComSenha(_anterior: Resultado<never> | null, dados: FormData): Promise<Resultado<never>> {
  const entrada = entradaSchema.safeParse({ email: dados.get("email"), senha: dados.get("senha"), volta: dados.get("volta") || undefined });
  if (!entrada.success) return falhaDeValidacao(entrada.error.issues);

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: entrada.data.email, password: entrada.data.senha });
  if (error) {
    const status = error.status ?? 0;
    logger.info("auth.entrada", { ok: false, status });
    // a mesma mensagem para e-mail inexistente e senha errada, de propósito
    if (status === 429) return falha("LIMITE", "Muitas tentativas.");
    if (status === 400 || status === 401 || status === 422) return falha("NAO_AUTENTICADO", "Credenciais inválidas.");
    return falha("INDISPONIVEL", "Serviço de entrada indisponível.");
  }
  logger.info("auth.entrada", { ok: true });
  const volta = entrada.data.volta ?? voltaDaTela(await headers());
  redirect(await destinoDepoisDoLogin(supabase, destinoSeguro(volta)));
}

// O `volta` vem no campo do formulário ou, se o campo vier vazio, na URL da própria tela de entrar (/login?volta=…),
// que o navegador manda no Referer (mesma origem). Assim a página do login fica estática. Sempre passa pelo destinoSeguro.
function voltaDaTela(cabecalhos: Headers): string | undefined {
  const origem = cabecalhos.get("referer");
  if (!origem) return undefined;
  try {
    const url = new URL(origem);
    return url.host === cabecalhos.get("host") && url.pathname === ROTA_LOGIN ? (url.searchParams.get("volta") ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

// O redirect de server action devolve a página de destino na mesma resposta, sem passar pelo proxy: por isso a ação
// aplica a mesma guarda com os claims da sessão que acabou de nascer (ADMIN sem aal2 vai antes para o 2º fator).
async function destinoDepoisDoLogin(supabase: Awaited<ReturnType<typeof criarClienteServidor>>, volta: string) {
  const { data } = await supabase.auth.getClaims();
  const alvo = new URL(volta, "http://interno.invalid");
  return decidirGuarda(alvo.pathname, alvo.search, data?.claims) ?? volta;
}

// Login com o Google (decisão do dono: fica para depois; pronto até o redirect). A origem vem da requisição, e o
// Supabase só aceita retorno das URLs liberadas no config.toml. O retorno passa pelo /auth/callback.
export async function entrarComGoogle(dados: FormData): Promise<void> {
  const supabase = await criarClienteServidor();
  const cabecalhos = await headers();
  const origem = `${cabecalhos.get("x-forwarded-proto") ?? "http"}://${cabecalhos.get("host") ?? ""}`;
  const volta = destinoSeguro(String(dados.get("volta") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origem}${ROTA_CALLBACK}?volta=${encodeURIComponent(volta)}` },
  });
  if (error || !data.url) {
    logger.warn("auth.google_indisponivel", { code: error?.code ?? "sem_url" });
    redirect(`${ROTA_LOGIN}?erro=google`);
  }
  redirect(data.url);
}

// Sair (POST por server action; o menu da pessoa do Frontend chama esta ação): encerra a sessão e volta ao /login.
export async function sair(): Promise<void> {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect(ROTA_LOGIN);
}
