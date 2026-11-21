import "server-only";
/**
 * Porta do gateway de cobrança da assinatura da clínica (PDD v206 §10.4.8, §20.3 "Asaas | Cobrança da mensalidade e
 * dos valores variáveis", §23.2 e §23.3). Dois adaptadores: o Asaas (`asaas.ts`) e o simulador (`simulador.ts`).
 *
 * - Valores sempre em centavos; o adaptador converte para o formato do gateway.
 * - Só mensal (§10.4.8: "O ATTA-in só tem cobrança mensal").
 * - Nenhum dado de cartão passa pelo ATTA: a assinatura nasce sem forma de pagamento definida, e a clínica escolhe
 *   boleto, Pix ou cartão na página de cobrança do próprio gateway.
 * - Razão social, CNPJ e e-mail vão ao gateway só para criar o cliente; nunca entram em log, falha ou trilha.
 */
import type { ResultadoProvedor } from "../comum/resultado-provedor";
import type { RequisicaoWebhook } from "../mensageria/porta";

/** Valor gravado em `billing.subscription.provider`. */
export type NomeGateway = "asaas" | "simulador";

export interface DadosCliente {
  readonly tenantId: string; // vai como referência externa
  readonly razaoSocial: string;
  readonly cnpj: string; // 14 dígitos; nos testes, só CNPJ gerado
  readonly email: string;
}

export interface NovaAssinatura {
  readonly idCliente: string;
  readonly tenantId: string;
  readonly valorCentavos: number;
  /** AAAA-MM-DD */
  readonly primeiroVencimento: string;
}

export type StatusCobranca = "pendente" | "paga" | "vencida" | "estornada" | "removida";

export interface CobrancaDoEvento {
  readonly idExterno: string;
  readonly vencimento: string; // AAAA-MM-DD
  readonly valorCentavos: number;
  readonly status: StatusCobranca;
  /** Página de cobrança do gateway (https). */
  readonly linkPagamento?: string;
}

/** Evento de webhook já autenticado e traduzido; vai para `api.billing_apply_event`. Só ids e status. */
export interface EventoCobranca {
  readonly idEvento: string;
  readonly tipo: string; // nome do evento no gateway, ex.: PAYMENT_RECEIVED
  readonly idAssinaturaExterna: string;
  readonly cobranca?: CobrancaDoEvento;
  readonly assinaturaRemovida: boolean;
}

export interface SituacaoAssinatura {
  readonly status: "ativa" | "inativa" | "expirada";
  readonly removida: boolean;
}

export interface GatewayCobranca {
  readonly nome: NomeGateway;
  /** Cria o cliente, ou devolve o que já existe para a clínica (repetir não duplica). */
  criarCliente(dados: DadosCliente): Promise<ResultadoProvedor<{ readonly idCliente: string }>>;
  /** Cria a assinatura mensal, ou devolve a que já existe para a clínica (repetir não duplica). */
  criarAssinatura(nova: NovaAssinatura): Promise<ResultadoProvedor<{ readonly idAssinatura: string }>>;
  consultarAssinatura(idAssinatura: string): Promise<ResultadoProvedor<SituacaoAssinatura>>;
  /**
   * Confere a autenticação do webhook e traduz. `null` = evento que não muda a assinatura (a rota responde 200 e
   * segue). Autenticação inválida = falha `assinatura_invalida`.
   */
  interpretarWebhook(requisicao: RequisicaoWebhook): ResultadoProvedor<EventoCobranca | null>;
}
