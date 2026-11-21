import { NextResponse, type NextRequest } from "next/server";
import { lerComTeto } from "@/lib/http/ler-com-teto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { montarGatewayCobranca } from "@/server/integracoes/cobranca/montagem";
import { apiDoBanco, processarWebhook } from "@/server/integracoes/cobranca/servico";

// Webhook do Asaas (MIG-32; PDD v206 §20.3 e §10.4.8). Sem sessão: autentica pelo token no `asaas-access-token`,
// conferido antes de ler o corpo. O evento é só gatilho; o estado vem da API do Asaas
// (src/server/integracoes/cobranca/servico.ts). O Asaas só considera sucesso o 200. Nada do corpo vai para log.
// No simulador (padrão), nenhum token autentica: toda chamada recebe 401. Runtime Node (o padrão; com cacheComponents,
// o segmento não declara runtime).
/** Um evento do Asaas tem poucos KB; acima disso, nem é lido. */
const TETO_DO_CORPO = 64 * 1024;

let gateway: ReturnType<typeof montarGatewayCobranca> | undefined;

export async function POST(request: NextRequest) {
  gateway ??= montarGatewayCobranca(process.env);
  const cabecalhos = { "asaas-access-token": request.headers.get("asaas-access-token") ?? undefined };
  const r = await processarWebhook({ gateway, banco: apiDoBanco(criarClienteAdmin(request.headers)) }, cabecalhos, () =>
    lerComTeto(request, TETO_DO_CORPO),
  );
  return new NextResponse(null, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
