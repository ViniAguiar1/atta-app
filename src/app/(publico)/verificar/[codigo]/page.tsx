import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaginaDeVerificacao } from "@/features/verificacao/components/PaginaDeVerificacao";
import { ResultadoDaVerificacao } from "@/features/verificacao/components/ResultadoDaVerificacao";
import { textos } from "@/features/verificacao/textos";
import { verificarCodigo } from "@/server/verificacao/verificar";

// Resultado da verificação pública (MIG-54; PDD v206 §18.6), sobre o verificarCodigo do #114 (Backend 6): limite por
// IP e teto da rota, código normalizado no servidor, inexistente e malformado com a mesma resposta. Sempre na hora do
// pedido; não indexado (um código por página).
export const metadata: Metadata = { title: "Verificação pública · ATTA", robots: { index: false, follow: false } };

export default async function Pagina({ params }: PageProps<"/verificar/[codigo]">) {
  const { codigo } = await params;
  const legivel = decodeURIComponent(codigo).slice(0, 40);
  return (
    <PaginaDeVerificacao codigo={legivel}>
      <Suspense fallback={<p aria-live="polite" className="text-corpo text-text-secondary">{textos.carregando}</p>}>
        <Resultado codigo={legivel} />
      </Suspense>
    </PaginaDeVerificacao>
  );
}

async function Resultado({ codigo }: { codigo: string }) {
  await connection();
  return <ResultadoDaVerificacao resultado={await verificarCodigo(codigo, await headers())} />;
}
