import { describe, expect, it, vi } from "vitest";
import { okProvedor, falhaProvedor } from "../comum/resultado-provedor";
import type { CobrancaDoEvento, GatewayCobranca } from "./porta";
import {
  contratarAssinatura,
  hojeNaCobranca,
  MENSALIDADE_CENTAVOS,
  processarWebhook,
  type Dependencias,
} from "./servico";
import { SimuladorCobranca } from "./simulador";

// tudo fictício
const TENANT = "00000000-0000-4000-8000-00000000000a";
const DADOS = { tenantId: TENANT, razaoSocial: "Clínica Fictícia Ltda", cnpj: "11222333000181", email: "a@b.test" };
const TOKEN = { "asaas-access-token": "token-ficticio" };

function bancoFalso(respostas: Record<string, { data?: unknown; error?: unknown }> = {}) {
  const rpc = vi.fn(async (fn: string, args: unknown) => {
    void args;
    return { data: null, error: null, ...(respostas[fn] ?? {}) };
  });
  return { rpc } as unknown as Dependencias["banco"] & { rpc: typeof rpc };
}

const cobrancaDaApi: CobrancaDoEvento = {
  idExterno: "pay_1",
  vencimento: "2026-12-21",
  valorCentavos: 39900,
  status: "paga",
  linkPagamento: "https://sandbox.asaas.com/i/ficticio",
};

function gatewayFalso(extra: Partial<GatewayCobranca> = {}): GatewayCobranca {
  return {
    nome: "asaas",
    criarCliente: vi.fn(async () => okProvedor({ idCliente: "cus_1" })),
    criarAssinatura: vi.fn(async () => okProvedor({ idAssinatura: "sub_1" })),
    consultarAssinatura: vi.fn(async () => okProvedor({ status: "inativa" as const, removida: true })),
    buscarCobranca: vi.fn(async () => okProvedor({ idAssinaturaExterna: "sub_1", cobranca: cobrancaDaApi })),
    autenticarWebhook: vi.fn((c) => c["asaas-access-token"] === "token-ficticio"),
    interpretarWebhook: vi.fn(() =>
      okProvedor({
        idEvento: "evt_1",
        tipo: "PAYMENT_RECEIVED",
        idAssinaturaExterna: "sub_1",
        // o corpo diz pendente e outro valor: quem manda é a API
        cobranca: { idExterno: "pay_1", vencimento: "2026-12-21", valorCentavos: 1, status: "pendente" as const },
        assinaturaRemovida: false,
      }),
    ),
    ...extra,
  };
}

describe("contratar a assinatura", () => {
  it("1º vencimento é hoje em São Paulo (§10.4.9), R$ 399 (§23.2), e registra no banco", async () => {
    const gateway = gatewayFalso();
    const banco = bancoFalso({
      billing_subscription_get: { data: [] },
      billing_subscription_register: { data: "id-1" },
    });
    const agora = new Date("2026-11-22T01:30:00Z"); // ainda 21/11 em São Paulo
    expect(hojeNaCobranca(agora)).toBe("2026-11-21");
    const r = await contratarAssinatura({ gateway, banco }, DADOS, agora);
    expect(r).toEqual({ ok: true, data: { subscriptionId: "id-1" } });
    expect(gateway.criarAssinatura).toHaveBeenCalledWith({
      idCliente: "cus_1",
      tenantId: TENANT,
      valorCentavos: MENSALIDADE_CENTAVOS,
      primeiroVencimento: "2026-11-21",
    });
    expect(banco.rpc).toHaveBeenCalledWith("billing_subscription_register", {
      p_tenant_id: TENANT,
      p_provider: "asaas",
      p_customer_external_id: "cus_1",
      p_subscription_external_id: "sub_1",
      p_value_cents: 39900,
    });
  });

  it("clínica que já tem assinatura não chama o gateway", async () => {
    const gateway = gatewayFalso();
    const banco = bancoFalso({ billing_subscription_get: { data: [{ id: "id-existente" }] } });
    expect(await contratarAssinatura({ gateway, banco }, DADOS)).toEqual({
      ok: true,
      data: { subscriptionId: "id-existente" },
    });
    expect(gateway.criarCliente).not.toHaveBeenCalled();
  });

  it("falha do gateway vira erro de borda sem a mensagem do provedor", async () => {
    const banco = bancoFalso({ billing_subscription_get: { data: [] } });
    const fora = gatewayFalso({ criarCliente: async () => falhaProvedor("transitoria", "rede", "asaas: rede") });
    expect(await contratarAssinatura({ gateway: fora, banco }, DADOS)).toMatchObject({
      ok: false,
      error: { code: "INDISPONIVEL" },
    });
    const recusado = gatewayFalso({
      criarCliente: async () => falhaProvedor("permanente", "asaas_invalid_cpfCnpj", "asaas: pedido recusado"),
    });
    expect(await contratarAssinatura({ gateway: recusado, banco }, DADOS)).toMatchObject({
      ok: false,
      error: { code: "VALIDACAO", reason: "asaas_invalid_cpfCnpj" },
    });
  });

  it("no simulador, a 1ª cobrança entra direto (sem webhook)", async () => {
    const banco = bancoFalso({
      billing_subscription_get: { data: [] },
      billing_subscription_register: { data: "id-1" },
    });
    await contratarAssinatura({ gateway: new SimuladorCobranca(), banco }, DADOS, new Date("2026-11-21T12:00:00Z"));
    const chamada = banco.rpc.mock.calls.find(([fn]) => fn === "billing_apply_event");
    expect(chamada?.[1]).toMatchObject({
      p_provider: "simulador",
      p_payment_status: "pendente",
      p_due_date: "2026-11-21",
      p_value_cents: 39900,
    });
  });
});

describe("webhook", () => {
  const ler = (corpo: string | null) => vi.fn(async () => corpo);

  it("token errado: 401 sem ler o corpo", async () => {
    const lerCorpo = ler("{}");
    const r = await processarWebhook(
      { gateway: gatewayFalso(), banco: bancoFalso() },
      { "asaas-access-token": "x" },
      lerCorpo,
    );
    expect(r.status).toBe(401);
    expect(lerCorpo).not.toHaveBeenCalled();
  });

  it("corpo acima do teto: 413", async () => {
    expect((await processarWebhook({ gateway: gatewayFalso(), banco: bancoFalso() }, TOKEN, ler(null))).status).toBe(
      413,
    );
  });

  it("aplica o status, o valor e o link da API, não do corpo", async () => {
    const banco = bancoFalso({ billing_apply_event: { data: "aplicado" } });
    const r = await processarWebhook({ gateway: gatewayFalso(), banco }, TOKEN, ler("{}"));
    expect(r).toEqual({ status: 200, resultado: "aplicado" });
    expect(banco.rpc).toHaveBeenCalledWith("billing_apply_event", {
      p_provider: "asaas",
      p_event_id: "evt_1",
      p_event_type: "PAYMENT_RECEIVED",
      p_subscription_external_id: "sub_1",
      p_payment_external_id: "pay_1",
      p_payment_status: "paga",
      p_due_date: "2026-12-21",
      p_value_cents: 39900,
      p_invoice_url: "https://sandbox.asaas.com/i/ficticio",
      p_subscription_removed: false,
    });
  });

  it("cobrança de outra assinatura na API, ou que não é de assinatura: 200 sem gravar", async () => {
    for (const buscarCobranca of [
      async () => okProvedor({ idAssinaturaExterna: "sub_outra", cobranca: cobrancaDaApi }),
      async () => okProvedor(null),
      async () => falhaProvedor("permanente", "http_404", "asaas: não encontrada"),
    ]) {
      const banco = bancoFalso();
      const r = await processarWebhook({ gateway: gatewayFalso({ buscarCobranca }), banco }, TOKEN, ler("{}"));
      expect(r).toEqual({ status: 200, resultado: "ignorado" });
      expect(banco.rpc).not.toHaveBeenCalled();
    }
  });

  it("gateway ou banco fora: 503 para o Asaas tentar de novo", async () => {
    const fora = gatewayFalso({ buscarCobranca: async () => falhaProvedor("transitoria", "http_503", "asaas: fora") });
    expect((await processarWebhook({ gateway: fora, banco: bancoFalso() }, TOKEN, ler("{}"))).status).toBe(503);
    const bancoFora = bancoFalso({ billing_apply_event: { error: { code: "57P01", message: "x" } } });
    expect((await processarWebhook({ gateway: gatewayFalso(), banco: bancoFora }, TOKEN, ler("{}"))).status).toBe(503);
  });

  it("evento ignorado ou ilegível: 200", async () => {
    for (const interpretarWebhook of [
      () => okProvedor(null),
      () => falhaProvedor("permanente", "corpo_invalido", "x"),
    ]) {
      const banco = bancoFalso();
      const g = gatewayFalso({ interpretarWebhook });
      expect(await processarWebhook({ gateway: g, banco }, TOKEN, ler("{}"))).toEqual({
        status: 200,
        resultado: "ignorado",
      });
      expect(banco.rpc).not.toHaveBeenCalled();
    }
  });

  it("assinatura removida só vale se a API confirmar", async () => {
    const remocao = () =>
      okProvedor({
        idEvento: "evt_2",
        tipo: "SUBSCRIPTION_DELETED",
        idAssinaturaExterna: "sub_1",
        assinaturaRemovida: true,
      });
    const naoRemovida = gatewayFalso({
      interpretarWebhook: remocao,
      consultarAssinatura: async () => okProvedor({ status: "ativa" as const, removida: false }),
    });
    const banco = bancoFalso();
    expect(await processarWebhook({ gateway: naoRemovida, banco }, TOKEN, ler("{}"))).toEqual({
      status: 200,
      resultado: "ignorado",
    });
    expect(banco.rpc).not.toHaveBeenCalled();

    const banco2 = bancoFalso({ billing_apply_event: { data: "aplicado" } });
    const r = await processarWebhook(
      { gateway: gatewayFalso({ interpretarWebhook: remocao }), banco: banco2 },
      TOKEN,
      ler("{}"),
    );
    expect(r.status).toBe(200);
    expect(banco2.rpc).toHaveBeenCalledWith(
      "billing_apply_event",
      expect.objectContaining({ p_subscription_removed: true }),
    );
  });

  it("o simulador não aceita webhook", async () => {
    const r = await processarWebhook({ gateway: new SimuladorCobranca(), banco: bancoFalso() }, TOKEN, ler("{}"));
    expect(r.status).toBe(401);
  });
});
