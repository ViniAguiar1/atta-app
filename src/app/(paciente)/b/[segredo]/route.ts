import { NextResponse } from "next/server";
import { COOKIE_LINK, opcoesDoCookieDoLink } from "@/server/boarding/cookies";
import { hashDoSegredo } from "@/server/grant/politica";

// Link do WhatsApp do Boarding Check (PDD §10.2.3; ADR 0004 §3, trava 1). Não renderiza nada nem consome o segredo:
// a pré-visualização do WhatsApp e o antivírus abrem o link sozinhos. Guarda o segredo num cookie HttpOnly de 10 min
// e manda para /boarding, sem o segredo na URL. Segredo fora do formato: o mesmo redirecionamento, sem cookie (a tela
// mostra o link sem validade, igual a um link vencido; sem oráculo).
// Location relativa: fica no mesmo host em que o cookie foi gravado (o request.url do Next pode trocar o host).
export async function GET(request: Request, { params }: RouteContext<"/b/[segredo]">) {
  const { segredo } = await params;
  const resposta = new NextResponse(null, { status: 303, headers: { Location: "/boarding" } });
  const https = request.headers.get("x-forwarded-proto") === "https";
  if (hashDoSegredo(segredo)) resposta.cookies.set(COOKIE_LINK, segredo, opcoesDoCookieDoLink(https));
  return resposta;
}
