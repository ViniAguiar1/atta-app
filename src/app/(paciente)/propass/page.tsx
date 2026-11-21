import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TEXTOS } from "@/features/propass/textos";
import { propassNoAr } from "@/server/propass/disponivel";
import { Conteudo } from "./conteudo";

// PROpass do profissional (PDD v206 §10.4.3; ADR 0004 §3). Sem login: abre pelo convite guardado pelo
// /propass/<segredo>. Nada de dado pessoal na URL. Cabeçalhos de segredo (no-referrer, no-store, noindex) pela
// ROTAS_COM_SEGREDO de src/lib/seguranca/cabecalhos.ts.
export const metadata: Metadata = { title: "PROpass · ATTA-in", robots: { index: false, follow: false } };

export default function Pagina() {
  // porta simulada: 404 na produção, fora do Suspense, antes de qualquer esqueleto (como no Boarding Check)
  if (!propassNoAr()) notFound();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-6 text-lg">
      <header className="flex items-baseline justify-between gap-4">
        {/* "ATTA" em Allerta Stencil e "-in" em Montserrat (Guia de Design §2.1), como no check-in */}
        <span className="text-2xl text-brand">
          <span className="font-atta">ATTA</span>
          <span className="font-product">-in</span>
        </span>
        <span className="text-base text-text-secondary">{TEXTOS.titulo}</span>
      </header>
      <main>
        <Suspense fallback={<p>{TEXTOS.carregando}</p>}>
          <Conteudo />
        </Suspense>
      </main>
    </div>
  );
}
