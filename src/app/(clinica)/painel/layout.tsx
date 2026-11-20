import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarraDoPainel } from "@/features/casca/components/BarraDoPainel";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { ROTA_LOGIN } from "@/lib/auth/rotas";
import { sair } from "../login/actions";

// Casca do painel da clínica (MIG-40): a barra de módulos em cima e a tela abaixo, no mesmo cartão, como no Simulador
// ATTA-in. Largura máxima de 1200 px e margem de 24 px (Guia de Design §6). A sessão é por requisição: a barra fica no
// Suspense (cacheComponents). Sem sessão, a tela de entrar (o proxy já desvia; aqui é a segunda trava).
export default function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[75rem] px-6 py-6">
      <div className="rounded-md border border-border bg-surface-app">
        <Suspense fallback={<div aria-hidden="true" className="min-h-[4.25rem] rounded-t-md bg-brand" />}>
          <Barra />
        </Suspense>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

async function Barra() {
  await connection(); // sempre na hora da requisição: o supabase-js lê o relógio ao carregar a sessão
  const sessao = await sessaoDoPainel();
  if (!sessao) redirect(ROTA_LOGIN);
  return <BarraDoPainel sessao={sessao} acaoSair={sair} />;
}
