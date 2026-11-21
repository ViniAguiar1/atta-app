import "server-only";
/**
 * Monta o gateway de cobrança a partir do ambiente. Padrão: simulador.
 * `ATTA_ASAAS_MODO=real` liga o Asaas, só no sandbox nesta fase (regra do TL, 21/11): exige `ATTA_ASAAS_AMBIENTE=sandbox`,
 * `ATTA_ASAAS_API_KEY` e `ATTA_ASAAS_WEBHOOK_TOKEN`; sem elas, ou com produção, o servidor não sobe.
 */
import { ConfiguracaoAusente } from "../mensageria/montagem";
import { AmbienteAsaasRecusado, GatewayAsaas } from "./asaas";
import type { GatewayCobranca } from "./porta";
import { SimuladorCobranca } from "./simulador";

type Ambiente = Readonly<Record<string, string | undefined>>;

const VARIAVEIS = ["ATTA_ASAAS_API_KEY", "ATTA_ASAAS_WEBHOOK_TOKEN", "ATTA_ASAAS_AMBIENTE"] as const;
/** O Asaas aceita token de webhook de 32 a 255 caracteres. */
const TOKEN = /^.{32,255}$/;

export function montarGatewayCobranca(env: Ambiente): GatewayCobranca {
  if (env.ATTA_ASAAS_MODO !== "real") return new SimuladorCobranca();
  const faltando = VARIAVEIS.filter((n) => !env[n]);
  if (faltando.length) throw new ConfiguracaoAusente(faltando);
  if (env.ATTA_ASAAS_AMBIENTE !== "sandbox") throw new AmbienteAsaasRecusado();
  if (!TOKEN.test(env.ATTA_ASAAS_WEBHOOK_TOKEN!)) throw new ConfiguracaoAusente(["ATTA_ASAAS_WEBHOOK_TOKEN"]);
  return new GatewayAsaas({ apiKey: env.ATTA_ASAAS_API_KEY!, webhookToken: env.ATTA_ASAAS_WEBHOOK_TOKEN! });
}
