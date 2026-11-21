import "server-only";
/**
 * Serviço da assinatura da clínica (MIG-32): contratar e processar o webhook do gateway, sobre o banco do #272.
 *
 * PDD v206 §23.2 (R$ 399/mês por estabelecimento), §10.4.9 ("A cobrança recorrente começa no pagamento": o 1º
 * vencimento é o dia da contratação, decisão do CTO em 21/11) e §10.4.8. NFS-e fora até o dono e a PO decidirem (R40).
 *
 * Webhook (condições da Segurança e do Tech Lead no #272/#279):
 * - o token é conferido antes de ler o corpo; corpo com teto (quem chama lê com limite);
 * - o webhook é só gatilho: status, valor, vencimento e link vêm de `buscarCobranca` (API do gateway), não do corpo;
 * - evento que não muda a assinatura responde 200; falha temporária responde 503 para o gateway tentar de novo;
 * - nada do corpo vai para log: só o tipo do evento e o resultado.
 * O `ResultadoProvedor` não sai daqui (ADR 0005 §3): a borda recebe `Resultado` ou o status HTTP.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import type { FalhaProvedor } from "../comum/resultado-provedor";
import type { RequisicaoWebhook } from "../mensageria/porta";
import type { DadosCliente, EventoCobranca, GatewayCobranca } from "./porta";
import { SimuladorCobranca } from "./simulador";

/** Mensalidade do ATTA-in base (PDD §23.2: "R$ 399/mês"). */
export const MENSALIDADE_CENTAVOS = 39_900;
const FUSO_DA_COBRANCA = "America/Sao_Paulo";

/** O cliente admin já no schema `api` (as funções do billing só existem lá): `criarClienteAdmin(h).schema("api")`. */
export function apiDoBanco(cliente: SupabaseClient<Database>) {
  return cliente.schema("api");
}
type Banco = Pick<ReturnType<typeof apiDoBanco>, "rpc">;

export interface Dependencias {
  readonly gateway: GatewayCobranca;
  readonly banco: Banco;
}

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo, onde a cobrança é emitida. */
export function hojeNaCobranca(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_DA_COBRANCA }).format(agora);
}

function falhaDoGateway(f: FalhaProvedor): Resultado<never> {
  // nunca a mensagem do provedor; o código vai como motivo, sem dado
  if (f.tipo === "permanente")
    return falha("VALIDACAO", "Confira os dados de cobrança da clínica.", undefined, f.codigo);
  return falha("INDISPONIVEL", "Serviço de cobrança indisponível no momento. Tente de novo.");
}

/** Grava um evento já traduzido (e, no webhook, já conferido na API do gateway). */
async function aplicarEvento(banco: Banco, provedor: GatewayCobranca["nome"], e: EventoCobranca) {
  return banco.rpc("billing_apply_event", {
    p_provider: provedor,
    p_event_id: e.idEvento,
    p_event_type: e.tipo,
    p_subscription_external_id: e.idAssinaturaExterna,
    ...(e.cobranca
      ? {
          p_payment_external_id: e.cobranca.idExterno,
          p_payment_status: e.cobranca.status,
          p_due_date: e.cobranca.vencimento,
          p_value_cents: e.cobranca.valorCentavos,
          ...(e.cobranca.linkPagamento ? { p_invoice_url: e.cobranca.linkPagamento } : {}),
        }
      : {}),
    p_subscription_removed: e.assinaturaRemovida,
  });
}

/**
 * Contrata a assinatura mensal da clínica: cliente e assinatura no gateway (repetir não duplica) e o registro no banco.
 * Quem chama confere antes que a pessoa pode contratar (checkout do §10.4.9 ou o back-office da ATTA).
 */
export async function contratarAssinatura(
  { gateway, banco }: Dependencias,
  dados: DadosCliente,
  agora = new Date(),
): Promise<Resultado<{ readonly subscriptionId: string }>> {
  const atual = await banco.rpc("billing_subscription_get", { p_tenant_id: dados.tenantId });
  if (atual.error) return falhaDoBanco(atual.error);
  const existente = atual.data?.[0];
  if (existente) return ok({ subscriptionId: existente.id });

  const cliente = await gateway.criarCliente(dados);
  if (!cliente.ok) return falhaDoGateway(cliente.falha);
  const assinatura = await gateway.criarAssinatura({
    idCliente: cliente.valor.idCliente,
    tenantId: dados.tenantId,
    valorCentavos: MENSALIDADE_CENTAVOS,
    primeiroVencimento: hojeNaCobranca(agora),
  });
  if (!assinatura.ok) return falhaDoGateway(assinatura.falha);

  const registro = await banco.rpc("billing_subscription_register", {
    p_tenant_id: dados.tenantId,
    p_provider: gateway.nome,
    p_customer_external_id: cliente.valor.idCliente,
    p_subscription_external_id: assinatura.valor.idAssinatura,
    p_value_cents: MENSALIDADE_CENTAVOS,
  });
  if (registro.error) return falhaDoBanco(registro.error);

  // o simulador não manda webhook: a 1ª cobrança entra direto, como o gateway real faria na criação
  if (gateway instanceof SimuladorCobranca) {
    const primeira = gateway.gerarCobranca(assinatura.valor.idAssinatura);
    if (primeira) {
      const r = await aplicarEvento(banco, gateway.nome, primeira);
      if (r.error) return falhaDoBanco(r.error);
    }
  }
  return ok({ subscriptionId: registro.data });
}

export type RespostaWebhook = { readonly status: 200 | 401 | 413 | 503; readonly resultado: string };

/**
 * Processa um webhook do gateway. `lerCorpo` lê com teto e devolve `null` se passar dele. O status é o que a rota
 * responde: o Asaas só considera sucesso o 200, e 15 falhas seguidas pausam a fila do webhook.
 */
export async function processarWebhook(
  { gateway, banco }: Dependencias,
  cabecalhos: RequisicaoWebhook["cabecalhos"],
  lerCorpo: () => Promise<string | null>,
): Promise<RespostaWebhook> {
  if (!gateway.autenticarWebhook(cabecalhos)) return { status: 401, resultado: "nao_autenticado" };
  const corpo = await lerCorpo();
  if (corpo === null) return { status: 413, resultado: "corpo_grande" };

  const traduzido = gateway.interpretarWebhook({ corpo, cabecalhos });
  if (!traduzido.ok) {
    // autenticado mas ilegível: repetir não resolve, e 400 pausaria a fila; registra e segue
    logger.warn("cobranca.webhook_ilegivel", { codigo: traduzido.falha.codigo });
    return { status: 200, resultado: "ignorado" };
  }
  let evento = traduzido.valor;
  if (!evento) return { status: 200, resultado: "ignorado" };

  if (evento.cobranca) {
    const atual = await gateway.buscarCobranca(evento.cobranca.idExterno);
    if (!atual.ok) {
      if (atual.falha.tipo === "permanente") return { status: 200, resultado: "ignorado" };
      return { status: 503, resultado: "gateway_indisponivel" };
    }
    // a API manda: cobrança que não é de assinatura, ou de outra assinatura que o corpo dizia, não entra
    if (!atual.valor || atual.valor.idAssinaturaExterna !== evento.idAssinaturaExterna) {
      logger.warn("cobranca.webhook_divergente", { tipo: evento.tipo });
      return { status: 200, resultado: "ignorado" };
    }
    evento = { ...evento, cobranca: atual.valor.cobranca };
  }
  if (evento.assinaturaRemovida) {
    // a remoção também vem da API: um token vazado não cancela a assinatura de ninguém
    const situacao = await gateway.consultarAssinatura(evento.idAssinaturaExterna);
    if (!situacao.ok) {
      if (situacao.falha.tipo === "permanente") return { status: 200, resultado: "ignorado" };
      return { status: 503, resultado: "gateway_indisponivel" };
    }
    if (!situacao.valor.removida) {
      logger.warn("cobranca.webhook_divergente", { tipo: evento.tipo });
      return { status: 200, resultado: "ignorado" };
    }
  }

  const r = await aplicarEvento(banco, gateway.nome, evento);
  if (r.error) {
    logger.error("cobranca.webhook_banco", { tipo: evento.tipo, codigo: r.error.code ?? null });
    return { status: 503, resultado: "banco_indisponivel" };
  }
  logger.info("cobranca.webhook", { tipo: evento.tipo, resultado: String(r.data) });
  return { status: 200, resultado: String(r.data) };
}
