import type { Metadata } from "next";
import { Suspense } from "react";
import { TelaDoSite } from "@/features/entrar/components/TelaDoSite";
import { Passo } from "./passo";

export const metadata: Metadata = { title: "Código do autenticador · ATTA" };

type Busca = Promise<{ volta?: string }>;

// Segundo fator (TOTP). Obrigatório para o ADMIN, opcional para o COLABORADOR (PDD omisso; decisão do dono, 20/11).
// O passo (ativar ou confirmar) sai do servidor, que tem a sessão; a tela só envia o código. Mesma moldura do site da
// tela de entrar (pedido do dono, 20/11): a rota fica no grupo (segundo-fator), fora do painel/layout.tsx, sem a casca.
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
