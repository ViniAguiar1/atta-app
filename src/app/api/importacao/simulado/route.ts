import { NextResponse } from "next/server";

// Destino do envio na porta simulada da importação (MIG-34): fora da produção, aceita o PUT da planilha e não guarda
// nada. Na produção não existe (404): lá a porta é a vazia e, depois, a real, com URL assinada do Storage.
export async function PUT() {
  if (process.env.VERCEL_ENV === "production") return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
