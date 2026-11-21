import { redirect } from "next/navigation";
import { connection } from "next/server";
import { destinoSeguro, ROTA_2FA, ROTA_LOGIN } from "@/lib/auth/rotas";
import { criarClienteServidor } from "@/lib/supabase/server";
import { SegundoFator } from "./SegundoFator";

// O passo do 2º fator (ativar, confirmar ou já ativo), lido no servidor com a sessão. Num arquivo próprio para o page.tsx
// exportar só o que o Next aceita e para o teste chamar o passo direto.
export type Busca = Promise<{ volta?: string }>;

export async function Passo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const volta = destinoSeguro((await searchParams).volta);
  const supabase = await criarClienteServidor();
  // Segunda trava (Segurança e Frontend 2, #230): fora do painel/layout.tsx, esta tela não herda a checagem de sessão da
  // casca. O proxy já leva quem não tem sessão ao login; aqui, sem usuário, o mesmo destino, sem mostrar passo nenhum.
  const { data: sessao } = await supabase.auth.getClaims();
  // o volta original (já passado pelo destinoSeguro) vai junto, para quem entrar seguir ao 2º fator e depois ao destino
  if (!sessao?.claims) redirect(`${ROTA_LOGIN}?volta=${encodeURIComponent(`${ROTA_2FA}?volta=${encodeURIComponent(volta)}`)}`);
  const [{ data: nivel }, { data: fatores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (nivel?.currentLevel === "aal2") return <SegundoFator passo={{ tipo: "ativo" }} volta={volta} />;
  const verificado = fatores?.totp.find((f) => f.status === "verified");
  return <SegundoFator passo={verificado ? { tipo: "confirmar", factorId: verificado.id } : { tipo: "ativar" }} volta={volta} />;
}
