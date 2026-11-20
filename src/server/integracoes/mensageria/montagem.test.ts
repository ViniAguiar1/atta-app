import { describe, expect, it } from "vitest";
import { ConfiguracaoAusente, montarProvedoresMensagem } from "./montagem";

// valores fictícios de teste
const TRAVA = { ATTA_ENVIO_PERMITIDOS: "", ATTA_CPF_PEPPER: "ab".repeat(32) };
const RESEND = {
  ATTA_EMAIL_MODO: "real",
  RESEND_API_KEY: "k",
  RESEND_WEBHOOK_SECRET: "whsec_eA==",
  ATTA_EMAIL_REMETENTE: "ATTA <a@b.test>",
};
const META = {
  ATTA_WHATSAPP_MODO: "real",
  ATTA_WHATSAPP_ACCESS_TOKEN: "token-teste",
  ATTA_WHATSAPP_PHONE_NUMBER_ID: "100000000000000",
  ATTA_WHATSAPP_APP_SECRET: "segredo-teste",
  ATTA_WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verificacao-teste",
};

function faltando(env: Record<string, string>): readonly string[] {
  try {
    montarProvedoresMensagem(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ConfiguracaoAusente);
    for (const valor of Object.values(env)) if (valor.length > 4) expect(String(e)).not.toContain(valor);
    return (e as ConfiguracaoAusente).variaveis;
  }
  return expect.unreachable();
}

describe("montagem dos provedores", () => {
  it("simulador em todo canal por padrão", () => {
    const p = montarProvedoresMensagem({});
    expect([p.email.nome, p.whatsapp.nome, p.sms.nome]).toEqual([
      "simulador-email",
      "simulador-whatsapp",
      "simulador-sms",
    ]);
  });

  it("modo real sem as variáveis não sobe, e diz só os nomes que faltam", () => {
    expect(faltando({ ATTA_EMAIL_MODO: "real", RESEND_API_KEY: "chave-teste" })).toEqual([
      "RESEND_WEBHOOK_SECRET",
      "ATTA_EMAIL_REMETENTE",
      "ATTA_ENVIO_PERMITIDOS",
      "ATTA_CPF_PEPPER",
    ]);
    expect(
      faltando({
        ATTA_WHATSAPP_MODO: "real",
        ATTA_WHATSAPP_ACCESS_TOKEN: "token-teste",
        ...TRAVA,
      }),
    ).toEqual(["ATTA_WHATSAPP_PHONE_NUMBER_ID", "ATTA_WHATSAPP_APP_SECRET", "ATTA_WHATSAPP_WEBHOOK_VERIFY_TOKEN"]);
  });

  it("modo real sem a lista de permitidos não sobe (ADR 0005 §1)", () => {
    expect(faltando({ ...META, ATTA_CPF_PEPPER: TRAVA.ATTA_CPF_PEPPER })).toEqual(["ATTA_ENVIO_PERMITIDOS"]);
  });

  it("modo real com as variáveis usa a Resend e a Meta, atrás da lista de permitidos", async () => {
    const p = montarProvedoresMensagem({ ...RESEND, ...META, ...TRAVA });
    expect([p.email.nome, p.whatsapp.nome, p.sms.nome]).toEqual(["resend", "meta-cloud", "simulador-sms"]);
    // lista vazia: nada sai, nem chega a chamar o provedor
    const r = await p.whatsapp.enviar({
      canal: "whatsapp",
      para: "+5511900000000",
      chaveIdempotencia: "k1",
      whatsapp: {
        modelo: "atta_link_checkin",
        idioma: "pt_BR",
        categoria: "utility",
        parametros: [],
      },
    });
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "permanente", codigo: "bloqueado_stage" },
    });
  });

  it("só o WhatsApp real deixa o e-mail no simulador", () => {
    const p = montarProvedoresMensagem({ ...META, ...TRAVA });
    expect([p.email.nome, p.whatsapp.nome]).toEqual(["simulador-email", "meta-cloud"]);
  });
});
