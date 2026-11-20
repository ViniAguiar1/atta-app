import { connection, NextResponse } from "next/server";

// Página de saúde: diz se o app está de pé e qual commit roda. Não toca no banco nem em segredo (ADR 0001 §4).
export async function GET() {
  await connection(); // sempre na hora da requisição, nunca pré-gerada
  return NextResponse.json(
    {
      status: "ok",
      service: "atta-app",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
      region: process.env.VERCEL_REGION ?? "local",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
