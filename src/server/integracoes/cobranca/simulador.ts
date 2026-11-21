import "server-only";
/**
 * Simulador do gateway de cobrança, para desenvolvimento, testes e o stage sem conta no Asaas.
 *
 * Não aceita webhook HTTP: os eventos nascem aqui dentro (`gerarCobranca`, `pagar`, `vencer`, `remover`) e o servidor
 * os aplica direto pela mesma função do webhook real. Assim ninguém "paga" uma cobrança do stage com um POST.
 * Cenários pelo CNPJ (só CNPJ gerado): terminado em 0000 = recusado (permanente); em 9999 = gateway fora (transitória).
 */
import { randomUUID } from "node:crypto";
import { falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type {
  CobrancaDoEvento,
  DadosCliente,
  EventoCobranca,
  GatewayCobranca,
  NovaAssinatura,
  SituacaoAssinatura,
  StatusCobranca,
} from "./porta";

interface AssinaturaSimulada {
  readonly id: string;
  readonly tenantId: string;
  readonly valorCentavos: number;
  readonly primeiroVencimento: string;
  removida: boolean;
}

export class SimuladorCobranca implements GatewayCobranca {
  readonly nome = "simulador" as const;
  private readonly clientes = new Map<string, string>(); // tenantId → idCliente
  private readonly assinaturas = new Map<string, AssinaturaSimulada>(); // idAssinatura → assinatura
  private readonly cobrancas = new Map<
    string,
    { idAssinatura: string; vencimento: string; valorCentavos: number; status: StatusCobranca }
  >();

  async criarCliente(c: DadosCliente): Promise<ResultadoProvedor<{ readonly idCliente: string }>> {
    if (c.cnpj.endsWith("0000")) return falhaProvedor("permanente", "sim_cnpj_recusado", "simulador: cliente recusado");
    if (c.cnpj.endsWith("9999")) return falhaProvedor("transitoria", "sim_indisponivel", "simulador: gateway fora");
    let id = this.clientes.get(c.tenantId);
    if (!id) {
      id = `cus_sim_${randomUUID()}`;
      this.clientes.set(c.tenantId, id);
    }
    return okProvedor({ idCliente: id });
  }

  async criarAssinatura(n: NovaAssinatura): Promise<ResultadoProvedor<{ readonly idAssinatura: string }>> {
    if (!Number.isInteger(n.valorCentavos) || n.valorCentavos <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(n.primeiroVencimento))
      return falhaProvedor("permanente", "assinatura_invalida", "simulador: valor ou vencimento inválido");
    const existente = [...this.assinaturas.values()].find((a) => a.tenantId === n.tenantId && !a.removida);
    if (existente) return okProvedor({ idAssinatura: existente.id });
    const id = `sub_sim_${randomUUID()}`;
    this.assinaturas.set(id, {
      id,
      tenantId: n.tenantId,
      valorCentavos: n.valorCentavos,
      primeiroVencimento: n.primeiroVencimento,
      removida: false,
    });
    return okProvedor({ idAssinatura: id });
  }

  async consultarAssinatura(id: string): Promise<ResultadoProvedor<SituacaoAssinatura>> {
    const a = this.assinaturas.get(id);
    if (!a) return falhaProvedor("permanente", "http_404", "simulador: assinatura não encontrada");
    return okProvedor({ status: a.removida ? "inativa" : "ativa", removida: a.removida });
  }

  async buscarCobranca(
    id: string,
  ): Promise<ResultadoProvedor<{ readonly idAssinaturaExterna: string; readonly cobranca: CobrancaDoEvento } | null>> {
    const c = this.cobrancas.get(id);
    if (!c) return falhaProvedor("permanente", "http_404", "simulador: cobrança não encontrada");
    return okProvedor({
      idAssinaturaExterna: c.idAssinatura,
      cobranca: { idExterno: id, vencimento: c.vencimento, valorCentavos: c.valorCentavos, status: c.status },
    });
  }

  /** O simulador não recebe webhook: nenhum cabeçalho autentica. */
  autenticarWebhook(): boolean {
    return false;
  }

  interpretarWebhook(): ResultadoProvedor<EventoCobranca | null> {
    return falhaProvedor("permanente", "assinatura_invalida", "simulador: não recebe webhook");
  }

  /** Gera a próxima cobrança da assinatura, como o gateway faz antes do vencimento. */
  gerarCobranca(idAssinatura: string, vencimento?: string): EventoCobranca | null {
    const a = this.assinaturas.get(idAssinatura);
    if (!a || a.removida) return null;
    const idCobranca = `pay_sim_${randomUUID()}`;
    const data = vencimento ?? a.primeiroVencimento;
    this.cobrancas.set(idCobranca, {
      idAssinatura,
      vencimento: data,
      valorCentavos: a.valorCentavos,
      status: "pendente",
    });
    return this.evento("PAYMENT_CREATED", idCobranca, "pendente");
  }

  pagar(idCobranca: string): EventoCobranca | null {
    return this.evento("PAYMENT_RECEIVED", idCobranca, "paga");
  }

  vencer(idCobranca: string): EventoCobranca | null {
    return this.evento("PAYMENT_OVERDUE", idCobranca, "vencida");
  }

  remover(idAssinatura: string): EventoCobranca | null {
    const a = this.assinaturas.get(idAssinatura);
    if (!a || a.removida) return null;
    a.removida = true;
    return {
      idEvento: `evt_sim_${randomUUID()}`,
      tipo: "SUBSCRIPTION_DELETED",
      idAssinaturaExterna: idAssinatura,
      assinaturaRemovida: true,
    };
  }

  private evento(tipo: string, idCobranca: string, status: StatusCobranca): EventoCobranca | null {
    const c = this.cobrancas.get(idCobranca);
    if (!c) return null;
    c.status = status;
    return {
      idEvento: `evt_sim_${randomUUID()}`,
      tipo,
      idAssinaturaExterna: c.idAssinatura,
      cobranca: { idExterno: idCobranca, vencimento: c.vencimento, valorCentavos: c.valorCentavos, status },
      assinaturaRemovida: false,
    };
  }
}
