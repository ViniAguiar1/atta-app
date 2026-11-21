import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PaginaDeVerificacao } from "@/features/verificacao/components/PaginaDeVerificacao";
import { ResultadoDaVerificacao } from "@/features/verificacao/components/ResultadoDaVerificacao";
import { verificarCodigo } from "@/server/verificacao/verificar";

// Resultado da verificação pública (MIG-54; PDD v206 §18.6), sobre o verificarCodigo do #114 (Backend 6): limite por
// IP e teto da rota, código normalizado no servidor, inexistente e malformado com a mesma resposta. Sempre na hora do
// pedido; não indexado (um código por página). Com Cache Components, o código da rota e o connection() só são lidos
// dentro do Suspense (como em /propass e /boarding): fora dele, o prerender do build recusa.
export const metadata: Metadata = { title: "Verificação pública · ATTA", robots: { index: false, follow: false } };

export default function Pagina({ params }: PageProps<"/verificar/[codigo]">) {
  return (
    <Suspense fallback={<PaginaDeVerificacao />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await params;
  const legivel = decodificar(codigo).slice(0, 40);
  return (
    <PaginaDeVerificacao codigo={legivel}>
      <ResultadoDaVerificacao resultado={await verificarCodigo(legivel, await headers())} />
    </PaginaDeVerificacao>
  );
}

/** "%" malformado na rota lança no decodeURIComponent: vira o próprio texto (o servidor responde "não encontrado"). */
function decodificar(codigo: string): string {
  try {
    return decodeURIComponent(codigo);
  } catch {
    return codigo;
  }
}
