import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarraDoPainel } from "@/features/casca/components/BarraDoPainel";
import { CascaDoPainel } from "@/features/casca/components/CascaDoPainel";
import { sessaoDoPainel } from "@/features/casca/sessao";
import { ROTA_LOGIN } from "@/lib/auth/rotas";
import { sair } from "../login/actions";

// Casca do painel da clínica (MIG-40): a barra de módulos colada no topo, de ponta a ponta, e a tela logo abaixo, direto no
// fundo da página (pedido do dono, 20/11: sem moldura, sem margem externa, sem cantos nem borda no contêiner). O espaçamento
// interno do conteúdo fica o de sempre. A sessão é por requisição: a barra fica no Suspense (cacheComponents). Sem sessão,
// a tela de entrar (o proxy já desvia; aqui é a segunda trava). Em /painel/seguranca (2º fator) a casca sai da frente e a
// tela usa a moldura do site (CascaDoPainel).
export default function LayoutDoPainel({ children }: { children: React.ReactNode }) {
  return (
    <CascaDoPainel
      barra={
        <Suspense fallback={<div aria-hidden="true" className="min-h-[4.25rem] bg-brand" />}>
          <Barra />
        </Suspense>
      }
    >
      {children}
    </CascaDoPainel>
  );
}

async function Barra() {
  await connection(); // sempre na hora da requisição: o supabase-js lê o relógio ao carregar a sessão
  const sessao = await sessaoDoPainel();
  if (!sessao) redirect(ROTA_LOGIN);
  return <BarraDoPainel sessao={sessao} acaoSair={sair} />;
}
