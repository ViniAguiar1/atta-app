import { describe, expect, it, vi } from "vitest";
import { ConfiguracaoAusente } from "../mensageria/montagem";
import { AmbienteAsaasRecusado, BASE_SANDBOX, GatewayAsaas } from "./asaas";
import { montarGatewayCobranca } from "./montagem";
import { SimuladorCobranca } from "./simulador";

// chaves, CNPJ e ids fictícios
const TOKEN = "token-webhook-ficticio-com-mais-de-32-caracteres";
const CONFIG = { apiKey: "$aact_hmlg_chave_ficticia", webhookToken: TOKEN };
const TENANT = "00000000-0000-4000-8000-00000000000a";
const CLIENTE = { tenantId: TENANT, razaoSocial: "Clínica Fictícia Ltda", cnpj: "11222333000181", email: "a@b.test" };

type Chamada = [string, RequestInit];
function respostas(...lista: [number, unknown][]) {
  const fila = [...lista];
  return vi.fn(async () => {
    const [status, corpo] = fila.shift() ?? [500, {}];
    return new Response(JSON.stringify(corpo), { status });
  });
}
const corpoDe = (f: ReturnType<typeof respostas>, i: number) =>
  JSON.parse(String((f.mock.calls[i] as unknown as Chamada)[1].body));
const urlDe = (f: ReturnType<typeof respostas>, i: number) => (f.mock.calls[i] as unknown as Chamada)[0];

describe("Asaas: cliente e assinatura", () => {
  it("cria o cliente com a clínica como referência, sem avisos do Asaas, e com o cabeçalho de acesso", async () => {
    const fetch = respostas([200, { data: [] }], [200, { id: "cus_000000000001" }]);
    const r = await new GatewayAsaas({ ...CONFIG, fetch }).criarCliente(CLIENTE);
    expect(r).toEqual({ ok: true, valor: { idCliente: "cus_000000000001" } });
    expect(urlDe(fetch, 0)).toBe(`${BASE_SANDBOX}/customers?externalReference=${TENANT}&limit=10`);
    expect(urlDe(fetch, 1)).toBe(`${BASE_SANDBOX}/customers`);
    expect(corpoDe(fetch, 1)).toEqual({
      name: "Clínica Fictícia Ltda",
      cpfCnpj: "11222333000181",
      email: "a@b.test",
      externalReference: TENANT,
      notificationDisabled: true,
    });
    const headers = (fetch.mock.calls[1] as unknown as Chamada)[1].headers as Record<string, string>;
    expect(headers.access_token).toBe(CONFIG.apiKey);
    expect(headers["User-Agent"]).toBe("atta-app");
  });

  it("repetir não duplica: devolve o cliente que já existe para a clínica", async () => {
    const fetch = respostas([200, { data: [{ id: "cus_velho", deleted: true }, { id: "cus_000000000001" }] }]);
    const r = await new GatewayAsaas({ ...CONFIG, fetch }).criarCliente(CLIENTE);
    expect(r).toEqual({ ok: true, valor: { idCliente: "cus_000000000001" } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("assinatura mensal sem forma definida (a clínica escolhe na página do Asaas), em reais", async () => {
    const fetch = respostas([200, { data: [] }], [200, { id: "sub_ficticia" }]);
    const r = await new GatewayAsaas({ ...CONFIG, fetch }).criarAssinatura({
      idCliente: "cus_000000000001",
      tenantId: TENANT,
      valorCentavos: 39900,
      primeiroVencimento: "2026-12-21",
    });
    expect(r).toEqual({ ok: true, valor: { idAssinatura: "sub_ficticia" } });
    expect(corpoDe(fetch, 1)).toEqual({
      customer: "cus_000000000001",
      billingType: "UNDEFINED",
      value: 399,
      nextDueDate: "2026-12-21",
      cycle: "MONTHLY",
      description: "ATTA-in: mensalidade",
      externalReference: TENANT,
    });
  });

  it("assinatura que já existe para a clínica não é criada de novo", async () => {
    const fetch = respostas([
      200,
      {
        data: [
          { id: "sub_outra", externalReference: "x" },
          { id: "sub_ficticia", externalReference: TENANT },
        ],
      },
    ]);
    const r = await new GatewayAsaas({ ...CONFIG, fetch }).criarAssinatura({
      idCliente: "cus_1",
      tenantId: TENANT,
      valorCentavos: 39900,
      primeiroVencimento: "2026-12-21",
    });
    expect(r).toEqual({ ok: true, valor: { idAssinatura: "sub_ficticia" } });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("valor ou vencimento inválido nem chega ao Asaas", async () => {
    const fetch = respostas();
    const g = new GatewayAsaas({ ...CONFIG, fetch });
    for (const n of [
      { valorCentavos: 0, primeiroVencimento: "2026-12-21" },
      { valorCentavos: 399.5, primeiroVencimento: "2026-12-21" },
      { valorCentavos: 39900, primeiroVencimento: "21/12/2026" },
    ])
      expect(await g.criarAssinatura({ idCliente: "cus_1", tenantId: TENANT, ...n })).toMatchObject({
        falha: { codigo: "assinatura_invalida" },
      });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("erros: 400 leva só o código do Asaas; 401 é configuração; 429 e rede são transitórios", async () => {
    const g400 = new GatewayAsaas({
      ...CONFIG,
      fetch: respostas(
        [200, { data: [] }],
        [400, { errors: [{ code: "invalid_cpfCnpj", description: "CNPJ 11222333000181 inválido" }] }],
      ),
    });
    const r = await g400.criarCliente(CLIENTE);
    expect(r).toMatchObject({ ok: false, falha: { tipo: "permanente", codigo: "asaas_invalid_cpfCnpj" } });
    expect(JSON.stringify(r)).not.toContain("11222333000181");

    expect(
      await new GatewayAsaas({ ...CONFIG, fetch: respostas([401, {}]) }).consultarAssinatura("sub_1"),
    ).toMatchObject({
      falha: { tipo: "configuracao" },
    });
    expect(
      await new GatewayAsaas({ ...CONFIG, fetch: respostas([429, {}]) }).consultarAssinatura("sub_1"),
    ).toMatchObject({
      falha: { tipo: "transitoria" },
    });
    const semRede = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await new GatewayAsaas({ ...CONFIG, fetch: semRede }).consultarAssinatura("sub_1")).toMatchObject({
      falha: { tipo: "transitoria", codigo: "rede" },
    });
  });

  it("consulta da assinatura traduz o status e a remoção", async () => {
    const g = new GatewayAsaas({ ...CONFIG, fetch: respostas([200, { status: "INACTIVE", deleted: true }]) });
    expect(await g.consultarAssinatura("sub_1")).toEqual({ ok: true, valor: { status: "inativa", removida: true } });
  });

  it("chave de produção é recusada na hora de montar", () => {
    expect(() => new GatewayAsaas({ ...CONFIG, apiKey: "$aact_prod_chave_ficticia" })).toThrow(AmbienteAsaasRecusado);
  });
});

describe("Asaas: webhook", () => {
  const g = new GatewayAsaas(CONFIG);
  const req = (corpo: unknown, token = TOKEN) => ({
    corpo: JSON.stringify(corpo),
    cabecalhos: { "asaas-access-token": token },
  });
  const pagamento = (extra: Record<string, unknown> = {}) => ({
    id: "pay_1_a1B2c3D4e5F6g7",
    subscription: "sub_ficticia",
    customer: "cus_000000000001",
    dueDate: "2026-12-21",
    value: 399,
    status: "PENDING",
    deleted: false,
    invoiceUrl: "https://sandbox.asaas.com/i/ficticio",
    ...extra,
  });
  const evt = (event: string, payment: unknown) => ({
    id: "evt_6561b631fa5580caadd00bbe3b858607&9193",
    event,
    dateCreated: "2026-11-21 11:11:04",
    payment,
  });

  it("token ausente ou diferente é recusado", () => {
    expect(g.interpretarWebhook({ corpo: "{}", cabecalhos: {} })).toMatchObject({
      falha: { codigo: "assinatura_invalida" },
    });
    expect(g.interpretarWebhook(req(evt("PAYMENT_CREATED", pagamento()), "outro-token"))).toMatchObject({
      falha: { codigo: "assinatura_invalida" },
    });
  });

  it("cobrança criada e paga: só ids, status, vencimento, valor em centavos e o link", () => {
    expect(g.interpretarWebhook(req(evt("PAYMENT_CREATED", pagamento())))).toEqual({
      ok: true,
      valor: {
        idEvento: "evt_6561b631fa5580caadd00bbe3b858607&9193",
        tipo: "PAYMENT_CREATED",
        idAssinaturaExterna: "sub_ficticia",
        cobranca: {
          idExterno: "pay_1_a1B2c3D4e5F6g7",
          vencimento: "2026-12-21",
          valorCentavos: 39900,
          status: "pendente",
          linkPagamento: "https://sandbox.asaas.com/i/ficticio",
        },
        assinaturaRemovida: false,
      },
    });
    for (const [status, nosso] of [
      ["RECEIVED", "paga"],
      ["CONFIRMED", "paga"],
      ["OVERDUE", "vencida"],
      ["REFUNDED", "estornada"],
    ])
      expect(g.interpretarWebhook(req(evt("PAYMENT_UPDATED", pagamento({ status }))))).toMatchObject({
        valor: { cobranca: { status: nosso } },
      });
  });

  it("remoção da cobrança vem pelo deleted ou pelo PAYMENT_DELETED", () => {
    expect(g.interpretarWebhook(req(evt("PAYMENT_DELETED", pagamento())))).toMatchObject({
      valor: { cobranca: { status: "removida" } },
    });
    expect(g.interpretarWebhook(req(evt("PAYMENT_UPDATED", pagamento({ deleted: true }))))).toMatchObject({
      valor: { cobranca: { status: "removida" } },
    });
  });

  it("assinatura removida no Asaas", () => {
    const r = g.interpretarWebhook(
      req({ id: "evt_2", event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_ficticia" } }),
    );
    expect(r).toEqual({
      ok: true,
      valor: {
        idEvento: "evt_2",
        tipo: "SUBSCRIPTION_DELETED",
        idAssinaturaExterna: "sub_ficticia",
        assinaturaRemovida: true,
      },
    });
  });

  it("evento que não muda a assinatura volta nulo (a rota responde 200 e segue)", () => {
    for (const corpo of [
      evt("PAYMENT_CREATED", pagamento({ subscription: null })), // cobrança avulsa
      evt("PAYMENT_CHARGEBACK_REQUESTED", pagamento({ status: "CHARGEBACK_REQUESTED" })),
      evt("PAYMENT_UPDATED", pagamento({ status: "STATUS_NOVO" })),
      { id: "evt_3", event: "SUBSCRIPTION_UPDATED", subscription: { id: "sub_ficticia" } },
      { id: "evt_4", event: "TRANSFER_DONE" },
    ])
      expect(g.interpretarWebhook(req(corpo))).toEqual({ ok: true, valor: null });
  });

  it("corpo inválido, sem id ou com link fora de https é tratado sem quebrar", () => {
    expect(g.interpretarWebhook({ corpo: "não é json", cabecalhos: { "asaas-access-token": TOKEN } })).toMatchObject({
      falha: { codigo: "corpo_invalido" },
    });
    expect(g.interpretarWebhook(req({ event: "PAYMENT_CREATED" }))).toMatchObject({
      falha: { codigo: "corpo_invalido" },
    });
    const r = g.interpretarWebhook(req(evt("PAYMENT_CREATED", pagamento({ invoiceUrl: "http://exemplo.test/x" }))));
    expect(r.ok && r.valor?.cobranca && "linkPagamento" in r.valor.cobranca).toBe(false);
  });
});

describe("simulador e montagem", () => {
  it("simulador: cria uma vez, gera, paga, vence e remove, e recusa webhook HTTP", async () => {
    const s = new SimuladorCobranca();
    const c1 = await s.criarCliente(CLIENTE);
    expect(await s.criarCliente(CLIENTE)).toEqual(c1);
    const a = await s.criarAssinatura({
      idCliente: "x",
      tenantId: TENANT,
      valorCentavos: 39900,
      primeiroVencimento: "2026-12-21",
    });
    if (!a.ok) throw new Error("assinatura");
    const criada = s.gerarCobranca(a.valor.idAssinatura)!;
    expect(criada.cobranca).toMatchObject({ status: "pendente", valorCentavos: 39900, vencimento: "2026-12-21" });
    expect(s.pagar(criada.cobranca!.idExterno)?.cobranca?.status).toBe("paga");
    expect(s.vencer(criada.cobranca!.idExterno)?.cobranca?.status).toBe("vencida");
    expect(s.remover(a.valor.idAssinatura)?.assinaturaRemovida).toBe(true);
    expect(await s.consultarAssinatura(a.valor.idAssinatura)).toEqual({
      ok: true,
      valor: { status: "inativa", removida: true },
    });
    expect(s.interpretarWebhook()).toMatchObject({ ok: false, falha: { codigo: "assinatura_invalida" } });
    expect(await s.criarCliente({ ...CLIENTE, cnpj: "11222333000000" })).toMatchObject({
      falha: { tipo: "permanente" },
    });
  });

  it("montagem: simulador por padrão; real só no sandbox e com as variáveis", () => {
    expect(montarGatewayCobranca({}).nome).toBe("simulador");
    expect(() => montarGatewayCobranca({ ATTA_ASAAS_MODO: "real", ATTA_ASAAS_API_KEY: "$aact_hmlg_x" })).toThrow(
      ConfiguracaoAusente,
    );
    const real = { ATTA_ASAAS_MODO: "real", ATTA_ASAAS_API_KEY: CONFIG.apiKey, ATTA_ASAAS_WEBHOOK_TOKEN: TOKEN };
    expect(() => montarGatewayCobranca({ ...real, ATTA_ASAAS_AMBIENTE: "producao" })).toThrow(AmbienteAsaasRecusado);
    expect(() =>
      montarGatewayCobranca({ ...real, ATTA_ASAAS_AMBIENTE: "sandbox", ATTA_ASAAS_API_KEY: "$aact_prod_x" }),
    ).toThrow(AmbienteAsaasRecusado);
    expect(() =>
      montarGatewayCobranca({ ...real, ATTA_ASAAS_AMBIENTE: "sandbox", ATTA_ASAAS_WEBHOOK_TOKEN: "curto" }),
    ).toThrow(ConfiguracaoAusente);
    expect(montarGatewayCobranca({ ...real, ATTA_ASAAS_AMBIENTE: "sandbox" }).nome).toBe("asaas");
  });
});
