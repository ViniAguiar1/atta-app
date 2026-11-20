import { NextResponse } from "next/server";
import { COOKIE_LINK_PROPASS, opcoesDoCookieDoPropass } from "@/server/propass/cookies";
import { propassNoAr } from "@/server/propass/disponivel";
import { hashDoSegredo } from "@/server/grant/politica";

// Link do convite do PROpass, enviado por e-mail (PDD §10.4.3; ADR 0004 §3, como o /b/ do Boarding Check). Não
// renderiza nem consome o segredo (pré-visualização e antivírus abrem o link sozinhos): guarda o segredo num cookie
// HttpOnly e manda para /propass, sem o segredo na URL. Fora do formato: o mesmo 303, sem cookie (sem oráculo).
export async function GET(request: Request, { params }: RouteContext<"/propass/[segredo]">) {
  if (!propassNoAr()) return new NextResponse(null, { status: 404 }); // porta simulada: fora da produção
  const { segredo } = await params;
  const resposta = new NextResponse(null, { status: 303, headers: { Location: "/propass" } });
  const https = request.headers.get("x-forwarded-proto") === "https";
  if (hashDoSegredo(segredo)) resposta.cookies.set(COOKIE_LINK_PROPASS, segredo, opcoesDoCookieDoPropass(https));
  return resposta;
}
