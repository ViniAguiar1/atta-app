import "server-only";
/**
 * Adaptador do gateway de cobrança: Asaas, API v3, pela HTTP (sem SDK). Contrato conferido na doc oficial em
 * 21/11/2026:
 * - base `https://api-sandbox.asaas.com/v3` (sandbox); autenticação pelo cabeçalho `access_token`; User-Agent exigido
 *   nas contas novas; chave de sandbox começa com `$aact_hmlg_`, a de produção com `$aact_prod_`;
 * - a API aceita cliente duplicado: antes de criar, procura pelo `externalReference` (o id da clínica);
 * - webhook: o token configurado chega no cabeçalho `asaas-access-token`; entrega "pelo menos uma vez", com o `id` do
 *   evento para deduplicar; a resposta tem de ser exatamente 200;
 * - `DELETED` não é status de cobrança: a remoção vem como `deleted: true` ou no evento `PAYMENT_DELETED`;
 * - ids são opacos (o formato dos ids de cobrança muda em produção entre 23 e 27/11/2026).
 * Nesta fase, só sandbox: o adaptador recusa o ambiente e a chave de produção (regra do TL, 21/11).
 * Variáveis: ATTA_ASAAS_API_KEY e ATTA_ASAAS_WEBHOOK_TOKEN (o dono cadastra quando a conta sandbox existir).
 */
import { iguaisEmTempoConstante } from "../comum/assinatura-webhook";
import { falhaPorStatusHttp, falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { RequisicaoWebhook } from "../mensageria/porta";
import type {
  CobrancaDoEvento,
  DadosCliente,
  EventoCobranca,
  GatewayCobranca,
  NovaAssinatura,
  SituacaoAssinatura,
  StatusCobranca,
} from "./porta";

export const BASE_SANDBOX = "https://api-sandbox.asaas.com/v3";
const TEMPO_LIMITE_MS = 10_000;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w&-]{1,100}$/; // opaco: letras, dígitos, _ - & (o id de evento traz &)

export class AmbienteAsaasRecusado extends Error {
  constructor() {
    super("Asaas: só o sandbox é aceito nesta fase");
  }
}

export interface ConfigAsaas {
  readonly apiKey: string;
  readonly webhookToken: string;
  readonly fetch?: typeof fetch;
}

/** Status da cobrança no Asaas → o nosso. Fora do mapa (estorno pedido, chargeback em disputa…): não muda nada. */
const STATUS: Readonly<Record<string, StatusCobranca>> = {
  PENDING: "pendente",
  AWAITING_RISK_ANALYSIS: "pendente",
  OVERDUE: "vencida",
  DUNNING_REQUESTED: "vencida",
  RECEIVED: "paga",
  CONFIRMED: "paga",
  RECEIVED_IN_CASH: "paga",
  DUNNING_RECEIVED: "paga",
  REFUNDED: "estornada",
};

interface PagamentoAsaas {
  readonly id?: unknown;
  readonly subscription?: unknown;
  readonly dueDate?: unknown;
  readonly value?: unknown;
  readonly status?: unknown;
  readonly deleted?: unknown;
  readonly invoiceUrl?: unknown;
}

const texto = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const paraCentavos = (reais: number) => Math.round(reais * 100);

/** Link de fatura só do Asaas (asaas.com ou subdomínio), em https: outro host na tela da clínica seria phishing. */
export function linkDoAsaas(valor: string): boolean {
  if (valor.length > 300) return false;
  try {
    const u = new URL(valor);
    return (
      u.protocol === "https:" &&
      u.username === "" &&
      u.password === "" &&
      u.port === "" &&
      (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com"))
    );
  } catch {
    return false;
  }
}

function traduzirCobranca(evento: string, p: PagamentoAsaas): CobrancaDoEvento | null {
  if (!texto(p.id) || !ID.test(p.id) || !texto(p.dueDate) || !DATA.test(p.dueDate)) return null;
  if (typeof p.value !== "number" || !Number.isFinite(p.value) || p.value < 0) return null;
  const status: StatusCobranca | undefined =
    evento === "PAYMENT_DELETED" || p.deleted === true ? "removida" : texto(p.status) ? STATUS[p.status] : undefined;
  if (!status) return null;
  const link = texto(p.invoiceUrl) && linkDoAsaas(p.invoiceUrl);
  return {
    idExterno: p.id,
    vencimento: p.dueDate,
    valorCentavos: paraCentavos(p.value),
    status,
    ...(link ? { linkPagamento: p.invoiceUrl as string } : {}),
  };
}

export class GatewayAsaas implements GatewayCobranca {
  readonly nome = "asaas" as const;

  constructor(private readonly config: ConfigAsaas) {
    // nunca produção nesta fase, nem por engano de chave
    if (config.apiKey.startsWith("$aact_prod_")) throw new AmbienteAsaasRecusado();
  }

  private async chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<ResultadoProvedor<T>> {
    let resposta: Response;
    try {
      resposta = await (this.config.fetch ?? fetch)(`${BASE_SANDBOX}${caminho}`, {
        method: metodo,
        headers: { access_token: this.config.apiKey, "Content-Type": "application/json", "User-Agent": "atta-app" },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch {
      return falhaProvedor("transitoria", "rede", "asaas: falha de rede ou tempo esgotado");
    }
    const dados = (await resposta.json().catch(() => ({}))) as { errors?: { code?: unknown }[] };
    if (!resposta.ok) {
      // só o código do Asaas (ex.: invalid_cpfCnpj); a descrição pode repetir o dado enviado
      const codigo = dados.errors?.[0]?.code;
      if (resposta.status === 400 && texto(codigo) && /^\w{1,60}$/.test(codigo))
        return falhaProvedor("permanente", `asaas_${codigo}`, "asaas: pedido recusado");
      return falhaPorStatusHttp(resposta.status, "asaas");
    }
    return okProvedor(dados as T);
  }

  async criarCliente(c: DadosCliente): Promise<ResultadoProvedor<{ readonly idCliente: string }>> {
    const ref = encodeURIComponent(c.tenantId);
    const existente = await this.chamar<{ data?: { id?: unknown; deleted?: unknown }[] }>(
      "GET",
      `/customers?externalReference=${ref}&limit=10`,
    );
    if (!existente.ok) return existente;
    const achado = existente.valor.data?.find((x) => texto(x.id) && x.deleted !== true);
    if (achado) return okProvedor({ idCliente: achado.id as string });

    const r = await this.chamar<{ id?: unknown }>("POST", "/customers", {
      name: c.razaoSocial,
      cpfCnpj: c.cnpj,
      email: c.email,
      externalReference: c.tenantId,
      notificationDisabled: true, // os avisos de cobrança saem pelo ATTA (régua do §10.4.8)
    });
    if (!r.ok) return r;
    return texto(r.valor.id)
      ? okProvedor({ idCliente: r.valor.id })
      : falhaProvedor("transitoria", "resposta_sem_id", "asaas: resposta sem id");
  }

  async criarAssinatura(n: NovaAssinatura): Promise<ResultadoProvedor<{ readonly idAssinatura: string }>> {
    if (!Number.isInteger(n.valorCentavos) || n.valorCentavos <= 0 || !DATA.test(n.primeiroVencimento))
      return falhaProvedor("permanente", "assinatura_invalida", "asaas: valor ou vencimento inválido");
    const existente = await this.chamar<{ data?: { id?: unknown; externalReference?: unknown; deleted?: unknown }[] }>(
      "GET",
      `/subscriptions?customer=${encodeURIComponent(n.idCliente)}&limit=10`,
    );
    if (!existente.ok) return existente;
    const achada = existente.valor.data?.find(
      (x) => texto(x.id) && x.externalReference === n.tenantId && x.deleted !== true,
    );
    if (achada) return okProvedor({ idAssinatura: achada.id as string });

    const r = await this.chamar<{ id?: unknown }>("POST", "/subscriptions", {
      customer: n.idCliente,
      billingType: "UNDEFINED", // a clínica escolhe boleto, Pix ou cartão na página do Asaas
      value: n.valorCentavos / 100,
      nextDueDate: n.primeiroVencimento,
      cycle: "MONTHLY",
      description: "ATTA-in: mensalidade",
      externalReference: n.tenantId,
    });
    if (!r.ok) return r;
    return texto(r.valor.id)
      ? okProvedor({ idAssinatura: r.valor.id })
      : falhaProvedor("transitoria", "resposta_sem_id", "asaas: resposta sem id");
  }

  async consultarAssinatura(id: string): Promise<ResultadoProvedor<SituacaoAssinatura>> {
    const r = await this.chamar<{ status?: unknown; deleted?: unknown }>(
      "GET",
      `/subscriptions/${encodeURIComponent(id)}`,
    );
    if (!r.ok) return r;
    const status = { ACTIVE: "ativa", INACTIVE: "inativa", EXPIRED: "expirada" } as const;
    const s = texto(r.valor.status) ? status[r.valor.status as keyof typeof status] : undefined;
    return s
      ? okProvedor({ status: s, removida: r.valor.deleted === true })
      : falhaProvedor("transitoria", "resposta_invalida", "asaas: status desconhecido");
  }

  async buscarCobranca(
    id: string,
  ): Promise<ResultadoProvedor<{ readonly idAssinaturaExterna: string; readonly cobranca: CobrancaDoEvento } | null>> {
    if (!ID.test(id)) return falhaProvedor("permanente", "id_invalido", "asaas: id de cobrança inválido");
    const r = await this.chamar<PagamentoAsaas>("GET", `/payments/${encodeURIComponent(id)}`);
    if (!r.ok) return r;
    const sub = r.valor.subscription;
    if (!texto(sub) || !ID.test(sub)) return okProvedor(null);
    const cobranca = traduzirCobranca("", r.valor);
    return okProvedor(cobranca ? { idAssinaturaExterna: sub, cobranca } : null);
  }

  autenticarWebhook(cabecalhos: RequisicaoWebhook["cabecalhos"]): boolean {
    return iguaisEmTempoConstante(cabecalhos["asaas-access-token"] ?? "", this.config.webhookToken);
  }

  interpretarWebhook(req: RequisicaoWebhook): ResultadoProvedor<EventoCobranca | null> {
    if (!this.autenticarWebhook(req.cabecalhos))
      return falhaProvedor("permanente", "assinatura_invalida", "asaas: token não confere");

    let dados: { id?: unknown; event?: unknown; payment?: PagamentoAsaas; subscription?: { id?: unknown } };
    try {
      dados = JSON.parse(req.corpo);
    } catch {
      return falhaProvedor("permanente", "corpo_invalido", "asaas: corpo inválido");
    }
    if (!texto(dados.id) || !ID.test(dados.id) || !texto(dados.event) || !/^[A-Z_]{1,60}$/.test(dados.event))
      return falhaProvedor("permanente", "corpo_invalido", "asaas: evento sem id ou tipo");
    const base = { idEvento: dados.id, tipo: dados.event };

    if (dados.event === "SUBSCRIPTION_DELETED") {
      const sub = dados.subscription?.id;
      return texto(sub) && ID.test(sub)
        ? okProvedor({ ...base, idAssinaturaExterna: sub, assinaturaRemovida: true })
        : okProvedor(null);
    }
    // só cobrança de assinatura; avulsa (importação etc.) e os outros eventos não mudam a assinatura
    if (!dados.event.startsWith("PAYMENT_") || !dados.payment) return okProvedor(null);
    const sub = dados.payment.subscription;
    if (!texto(sub) || !ID.test(sub)) return okProvedor(null);
    const cobranca = traduzirCobranca(dados.event, dados.payment);
    return cobranca
      ? okProvedor({ ...base, idAssinaturaExterna: sub, cobranca, assinaturaRemovida: false })
      : okProvedor(null);
  }
}
