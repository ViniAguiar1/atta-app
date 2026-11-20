import { describe, expect, it, vi } from "vitest";
import { hmacSha256 } from "../comum/assinatura-webhook";
import type { MensagemRenderizada } from "../mensageria/tipos";
import { VERSAO_GRAPH, WhatsAppMetaCloud } from "./meta-cloud";

// credenciais e números fictícios
const CONFIG = {
  accessToken: "token-teste",
  phoneNumberId: "100000000000000",
  appSecret: "segredo-teste",
  verifyToken: "verificacao-teste",
};
const PARA = "+5511900000001";

const codigo: MensagemRenderizada = {
  canal: "whatsapp",
  para: PARA,
  chaveIdempotencia: "k1",
  whatsapp: {
    modelo: "atta_codigo_verificacao",
    idioma: "pt_BR",
    categoria: "authentication",
    parametros: ["123456"],
    codigoNoBotao: "123456",
  },
};
const link: MensagemRenderizada = {
  canal: "whatsapp",
  para: PARA,
  chaveIdempotencia: "k2",
  whatsapp: {
    modelo: "atta_link_boarding_check",
    idioma: "pt_BR",
    categoria: "utility",
    parametros: ["Clínica Exemplo", "21/11 às 09:00", "https://attahub.com.br/b/abc"],
  },
};

function resposta(status: number, corpo: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
}

describe("envio pela Cloud API da Meta", () => {
  it("modelo de autenticação: código no corpo e no botão de copiar, sem o + no número", async () => {
    const fetch = resposta(200, { messages: [{ id: "wamid.TESTE1" }] });
    const r = await new WhatsAppMetaCloud({ ...CONFIG, fetch }).enviar(codigo);
    expect(r).toEqual({ ok: true, valor: { idExterno: "wamid.TESTE1" } });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://graph.facebook.com/${VERSAO_GRAPH}/100000000000000/messages`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-teste");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511900000001",
      type: "template",
      template: {
        name: "atta_codigo_verificacao",
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "123456" }] },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "123456" }],
          },
        ],
      },
    });
  });

  it("modelo utilitário: só o corpo, com os parâmetros na ordem", async () => {
    const fetch = resposta(200, { messages: [{ id: "wamid.TESTE2" }] });
    await new WhatsAppMetaCloud({ ...CONFIG, fetch }).enviar(link);
    const corpo = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(corpo.template.components).toEqual([
      {
        type: "body",
        parameters: link.whatsapp!.parametros.map((text) => ({
          type: "text",
          text,
        })),
      },
    ]);
  });

  it.each([
    [190, "configuracao"],
    [250, "configuracao"],
    [132001, "configuracao"],
    [132015, "configuracao"],
    [130429, "transitoria"],
    [131000, "transitoria"],
    [131026, "permanente"],
    [132012, "permanente"],
  ] as const)("erro %i da Meta vira falha %s, sem repetir a mensagem do provedor", async (code, tipo) => {
    const fetch = resposta(400, {
      error: { code, message: `(#${code}) recusado para ${PARA}` },
    });
    const r = await new WhatsAppMetaCloud({ ...CONFIG, fetch }).enviar(link);
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo, codigo: `whatsapp_${code}` },
    });
    expect(JSON.stringify(r)).not.toContain("900000001");
  });

  it("código desconhecido cai na classificação por status HTTP", async () => {
    const r = await new WhatsAppMetaCloud({
      ...CONFIG,
      fetch: resposta(503, { error: { code: 999999 } }),
    }).enviar(link);
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "transitoria", codigo: "http_503" },
    });
  });

  it("rede fora ou tempo esgotado é transitória", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const r = await new WhatsAppMetaCloud({ ...CONFIG, fetch }).enviar(link);
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "transitoria", codigo: "rede" },
    });
  });

  it("resposta 200 sem id é transitória", async () => {
    const r = await new WhatsAppMetaCloud({
      ...CONFIG,
      fetch: resposta(200, {}),
    }).enviar(link);
    expect(r).toMatchObject({
      ok: false,
      falha: { codigo: "resposta_sem_id" },
    });
  });

  it("recusa mensagem sem modelo e telefone fora do E.164 sem chamar a Meta", async () => {
    const fetch = resposta(200, {});
    const meta = new WhatsAppMetaCloud({ ...CONFIG, fetch });
    expect(
      await meta.enviar({
        canal: "whatsapp",
        para: PARA,
        chaveIdempotencia: "k",
      }),
    ).toMatchObject({
      falha: { codigo: "mensagem_invalida" },
    });
    expect(await meta.enviar({ ...link, para: "11900000001" })).toMatchObject({
      falha: { codigo: "destinatario_invalido" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("webhook da Meta", () => {
  const meta = new WhatsAppMetaCloud(CONFIG);
  const assinar = (corpo: string, segredo = CONFIG.appSecret) => ({
    corpo,
    cabecalhos: {
      "x-hub-signature-256": `sha256=${hmacSha256(segredo, corpo, "hex")}`,
    },
  });
  const evento = (statuses: unknown[]) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "messages",
              value: { messaging_product: "whatsapp", statuses },
            },
          ],
        },
      ],
    });

  it("verificação por GET devolve o desafio só com o token certo", () => {
    const params = (token: string, modo = "subscribe") =>
      new URLSearchParams({
        "hub.mode": modo,
        "hub.verify_token": token,
        "hub.challenge": "1158201444",
      });
    expect(meta.responderVerificacao(params("verificacao-teste"))).toBe("1158201444");
    expect(meta.responderVerificacao(params("outro"))).toBeNull();
    expect(meta.responderVerificacao(params("verificacao-teste", "unsubscribe"))).toBeNull();
    expect(meta.responderVerificacao(new URLSearchParams({ "hub.mode": "subscribe" }))).toBeNull();
  });

  it("assinatura ausente, de outro segredo ou de outro corpo é recusada", () => {
    const corpo = evento([]);
    expect(meta.interpretarRetorno({ corpo, cabecalhos: {} })).toMatchObject({
      ok: false,
      falha: { codigo: "assinatura_invalida" },
    });
    expect(meta.interpretarRetorno(assinar(corpo, "segredo-errado"))).toMatchObject({ ok: false });
    expect(meta.interpretarRetorno({ ...assinar(corpo), corpo: `${corpo} ` })).toMatchObject({ ok: false });
  });

  it("traduz entregue, lido e falhou, com cobrança pelo pricing.type", () => {
    const corpo = evento([
      {
        id: "wamid.A",
        status: "delivered",
        timestamp: "1795600000",
        recipient_id: "5511900000001",
        pricing: {
          billable: true,
          pricing_model: "PMP",
          type: "regular",
          category: "utility",
        },
      },
      {
        id: "wamid.B",
        status: "read",
        timestamp: "1795600060",
        pricing: {
          billable: false,
          pricing_model: "PMP",
          type: "free_customer_service",
          category: "service",
        },
      },
      {
        id: "wamid.C",
        status: "failed",
        timestamp: "1795600120",
        errors: [{ code: 131026, title: "x" }],
      },
      {
        id: "wamid.D",
        status: "sent",
        timestamp: "1795600180",
        pricing: { billable: true },
      },
      { id: "wamid.E", status: "played", timestamp: "1795600240" },
    ]);
    const r = meta.interpretarRetorno(assinar(corpo));
    expect(r).toEqual({
      ok: true,
      valor: [
        {
          canal: "whatsapp",
          idExterno: "wamid.A",
          estado: "entregue",
          quando: new Date(1795600000_000),
          cobravel: true,
        },
        {
          canal: "whatsapp",
          idExterno: "wamid.B",
          estado: "lido",
          quando: new Date(1795600060_000),
          cobravel: false,
        },
        {
          canal: "whatsapp",
          idExterno: "wamid.C",
          estado: "falhou",
          quando: new Date(1795600120_000),
          codigoFalha: "whatsapp_131026",
        },
        {
          canal: "whatsapp",
          idExterno: "wamid.D",
          estado: "enviado",
          quando: new Date(1795600180_000),
          cobravel: true,
        },
      ],
    });
    // o número do destinatário que a Meta manda não sai do adaptador
    expect(JSON.stringify(r)).not.toContain("900000001");
  });

  it("mensagem recebida (sem statuses) e status malformado não geram retorno", () => {
    const corpo = JSON.stringify({
      entry: [
        {
          changes: [{ value: { messages: [{ from: "5511900000001", type: "text" }] } }],
        },
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: "wamid.X", status: "delivered" },
                  { status: "read", timestamp: "1" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(meta.interpretarRetorno(assinar(corpo))).toEqual({
      ok: true,
      valor: [],
    });
  });

  it("corpo assinado mas inválido é recusado", () => {
    expect(meta.interpretarRetorno(assinar("não é json"))).toMatchObject({
      ok: false,
      falha: { codigo: "corpo_invalido" },
    });
  });
});
