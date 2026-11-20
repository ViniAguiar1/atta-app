import { describe, expect, it } from "vitest";
import { hmacSha256 } from "../comum/assinatura-webhook";
import { EmailResend } from "./resend";

// Segredo e chave de TESTE, inventados para este arquivo; nenhum é chave real.
const SEGREDO_TESTE = "segredo-de-teste-do-webhook";
const WHSEC = `whsec_${Buffer.from(SEGREDO_TESTE).toString("base64")}`;
const AGORA = new Date("2026-11-20T15:00:00Z");
const TS = String(AGORA.getTime() / 1000);

function resend(resposta?: { status: number; corpo: unknown }, capturar?: (init: RequestInit) => void) {
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    capturar?.(init);
    return new Response(JSON.stringify(resposta?.corpo ?? { id: "email_1" }), { status: resposta?.status ?? 200 });
  }) as unknown as typeof fetch;
  return new EmailResend({
    apiKey: "chave-teste",
    webhookSecret: WHSEC,
    remetente: "ATTA <teste@exemplo.test>",
    fetch: fetchFalso,
    agora: () => AGORA,
  });
}

const mensagem = {
  canal: "email" as const,
  para: "gestor@clinica-ficticia.test",
  chaveIdempotencia: "envio-1",
  assunto: "ATTA: Paciente atrasado",
  texto: "Paciente atrasado em 20/11 às 12:15.",
  html: "<p>Paciente atrasado em 20/11 às 12:15.</p>",
};

const assinar = (corpo: string, id = "msg_1", ts = TS) => ({
  "svix-id": id,
  "svix-timestamp": ts,
  "svix-signature": `v1,${hmacSha256(Buffer.from(SEGREDO_TESTE), `${id}.${ts}.${corpo}`, "base64")}`,
});

describe("adaptador Resend: envio", () => {
  it("manda a chave de idempotência e devolve o id da Resend", async () => {
    let init: RequestInit | undefined;
    const r = await resend(undefined, (i) => (init = i)).enviar(mensagem);
    expect(r).toEqual({ ok: true, valor: { idExterno: "email_1" } });
    const cabecalhos = init?.headers as Record<string, string>;
    expect(cabecalhos["Idempotency-Key"]).toBe("envio-1");
    expect(cabecalhos.Authorization).toBe("Bearer chave-teste");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      to: ["gestor@clinica-ficticia.test"],
      subject: mensagem.assunto,
      text: mensagem.texto,
    });
  });

  it("classifica as falhas da Resend", async () => {
    const casos: [number, unknown, string, string][] = [
      [409, { name: "concurrent_idempotent_requests" }, "transitoria", "http_409"],
      [409, { name: "invalid_idempotent_request" }, "permanente", "resend_idempotencia"],
      [429, { name: "rate_limit_exceeded" }, "transitoria", "http_429"],
      [429, { name: "daily_quota_exceeded" }, "configuracao", "resend_cota"],
      [401, { name: "missing_api_key" }, "configuracao", "http_401"],
      [422, { name: "missing_required_field" }, "permanente", "http_422"],
      [503, { name: "service_unavailable" }, "transitoria", "http_503"],
    ];
    for (const [status, corpo, tipo, codigo] of casos) {
      const r = await resend({ status, corpo }).enviar(mensagem);
      expect(!r.ok && { tipo: r.falha.tipo, codigo: r.falha.codigo }, `${status} ${JSON.stringify(corpo)}`).toEqual({
        tipo,
        codigo,
      });
    }
  });

  it("falha de rede é transitória e a mensagem não leva o destinatário", async () => {
    const quebrado = new EmailResend({
      apiKey: "x",
      webhookSecret: WHSEC,
      remetente: "r",
      fetch: (async () => {
        throw new Error("gestor@clinica-ficticia.test");
      }) as unknown as typeof fetch,
    });
    const r = await quebrado.enviar(mensagem);
    expect(!r.ok && r.falha).toMatchObject({ tipo: "transitoria", codigo: "rede" });
    expect(JSON.stringify(r)).not.toContain("clinica-ficticia");
  });
});

describe("adaptador Resend: webhook", () => {
  it("assinatura válida vira retorno de entrega", () => {
    const corpo = JSON.stringify({
      type: "email.delivered",
      created_at: AGORA.toISOString(),
      data: { email_id: "email_1" },
    });
    const r = resend().interpretarRetorno({ corpo, cabecalhos: assinar(corpo) });
    expect(r.ok && r.valor).toEqual([
      { canal: "email", idExterno: "email_1", estado: "entregue", quando: AGORA, cobravel: false },
    ]);
  });

  it("bounce, failed e suppressed viram falha, com o tipo do evento", () => {
    for (const type of ["email.bounced", "email.failed", "email.suppressed"]) {
      const corpo = JSON.stringify({ type, created_at: AGORA.toISOString(), data: { email_id: "email_2" } });
      const r = resend().interpretarRetorno({ corpo, cabecalhos: assinar(corpo) });
      expect(r.ok && r.valor[0]).toMatchObject({ estado: "falhou", codigoFalha: type });
    }
  });

  it("evento que não muda a entrega é ignorado", () => {
    const corpo = JSON.stringify({
      type: "email.clicked",
      created_at: AGORA.toISOString(),
      data: { email_id: "email_1" },
    });
    const r = resend().interpretarRetorno({ corpo, cabecalhos: assinar(corpo) });
    expect(r.ok && r.valor).toEqual([]);
  });

  it("recusa assinatura errada, corpo alterado, cabeçalho ausente e carimbo velho", () => {
    const corpo = JSON.stringify({
      type: "email.delivered",
      created_at: AGORA.toISOString(),
      data: { email_id: "email_1" },
    });
    const ruins = [
      { corpo, cabecalhos: { ...assinar(corpo), "svix-signature": "v1,AAAA" } },
      { corpo: corpo.replace("email_1", "email_9"), cabecalhos: assinar(corpo) },
      { corpo, cabecalhos: { "svix-id": "msg_1", "svix-timestamp": TS } },
      { corpo, cabecalhos: assinar(corpo, "msg_1", String(Number(TS) - 301)) },
    ];
    for (const req of ruins)
      expect(resend().interpretarRetorno(req)).toMatchObject({ ok: false, falha: { codigo: "assinatura_invalida" } });
  });

  it("aceita quando uma das assinaturas da lista confere (troca de segredo)", () => {
    const corpo = JSON.stringify({
      type: "email.sent",
      created_at: AGORA.toISOString(),
      data: { email_id: "email_1" },
    });
    const boa = assinar(corpo)["svix-signature"];
    const r = resend().interpretarRetorno({
      corpo,
      cabecalhos: { ...assinar(corpo), "svix-signature": `v1,velha ${boa}` },
    });
    expect(r.ok).toBe(true);
  });
});
