import type { Metadata } from "next";
import { Suspense } from "react";
import { Cabecalho } from "@/features/boarding/components/Cabecalho";
import { TelaPin } from "@/features/boarding/components/TelaPin";
import { TEXTOS } from "@/features/boarding/textos";
import { lerLink, lerSessao } from "@/server/boarding/cookies";
import { portaBoarding } from "@/server/boarding/porta";

// Boarding Check do profissional (PDD v206 §10.2.3; ADR 0004 §3). Sem login: com a sessão do PIN, mostra o
// atendimento; sem ela, pede o PIN do link guardado pelo /b/<segredo>. Nada de dado pessoal na URL. Headers
// (no-referrer, no-store, noindex) no next.config.ts.
export const metadata: Metadata = { title: "Boarding Check · ATTA-in", robots: { index: false, follow: false } };

export default function Pagina() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-6 text-lg">
      <header>
        {/* "ATTA" em Allerta Stencil e "-in" em Montserrat (Guia de Design §2.1), como no check-in */}
        <span className="text-2xl text-brand">
          <span className="font-atta">ATTA</span>
          <span className="font-product">-in</span>
        </span>
      </header>
      <main>
        <Suspense fallback={<p>{TEXTOS.carregando}</p>}>
          <Conteudo />
        </Suspense>
      </main>
    </div>
  );
}

async function Conteudo() {
  const sessao = await lerSessao();
  if (sessao) {
    const r = await portaBoarding.abrir(sessao);
    if (r.ok) return <Cabecalho resumo={r.data} />;
  }
  return <TelaPin temLink={Boolean(await lerLink())} />;
}
