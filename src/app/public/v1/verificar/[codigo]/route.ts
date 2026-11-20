import { connection, NextResponse } from "next/server";
import type { CodigoDeErro } from "@/lib/errors";
import { verificarCodigo } from "@/server/verificacao/verificar";

// Verificação pública do Código ATTA (MIG-24; PDD v206 §18.6; ADR 0006 §6): GET /public/v1/verificar/{codigo}, sem
// login. O código vai na rota (não é dado pessoal). A resposta tem exatamente as 8 chaves da ADR; inexistente e
// malformado respondem igual (200, exists = false). 30 consultas por minuto por IP (429) e teto da rota (503).
// Sem `runtime`/`dynamic` (incompatíveis com cacheComponents): o padrão já é Node, e o connection() abaixo deixa a
// resposta sempre na hora do pedido, nunca pré-gerada nem em cache.

const CABECALHOS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
} as const;

const STATUS_HTTP: Partial<Record<CodigoDeErro, number>> = { LIMITE: 429, INDISPONIVEL: 503 };

export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  await connection();
  const { codigo } = await params;
  const r = await verificarCodigo(codigo, request.headers);
  if (r.ok) return NextResponse.json(r.data, { headers: CABECALHOS });
  const status = STATUS_HTTP[r.error.code] ?? 500;
  return NextResponse.json(
    { code: r.error.code, message: r.error.message },
    { status, headers: status === 429 || status === 503 ? { ...CABECALHOS, "Retry-After": "60" } : CABECALHOS },
  );
}
