import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { TelaDoSite } from "@/features/entrar/components/TelaDoSite";
import { destinoSeguro } from "@/lib/auth/rotas";
import { criarClienteServidor } from "@/lib/supabase/server";
import { SegundoFator } from "./SegundoFator";

export const metadata: Metadata = { title: "Código do autenticador · ATTA" };

type Busca = Promise<{ volta?: string }>;

// Segundo fator (TOTP). Obrigatório para o ADMIN, opcional para o COLABORADOR (PDD omisso; decisão do dono, 20/11).
// O passo (ativar ou confirmar) sai do servidor, que tem a sessão; a tela só envia o código. Mesma moldura do site da
// tela de entrar (pedido do dono, 20/11): a casca do painel não desenha a barra aqui (painel/layout.tsx).
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <TelaDoSite>
      <div className="flex flex-col gap-6">
        <h1 className="font-title text-3xl text-text-primary">Código do autenticador</h1>
        <Suspense fallback={<p className="text-text-secondary">Carregando…</p>}>
          <Passo searchParams={searchParams} />
        </Suspense>
      </div>
    </TelaDoSite>
  );
}

async function Passo({ searchParams }: { searchParams: Busca }) {
  await connection();
  const volta = destinoSeguro((await searchParams).volta);
  const supabase = await criarClienteServidor();
  const [{ data: nivel }, { data: fatores }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (nivel?.currentLevel === "aal2") return <SegundoFator passo={{ tipo: "ativo" }} volta={volta} />;
  const verificado = fatores?.totp.find((f) => f.status === "verified");
  return <SegundoFator passo={verificado ? { tipo: "confirmar", factorId: verificado.id } : { tipo: "ativar" }} volta={volta} />;
}
