import { describe, expect, it } from "vitest";
import { ConfiguracaoAusente, montarProvedoresMensagem } from "./montagem";

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
    try {
      montarProvedoresMensagem({ ATTA_EMAIL_MODO: "real", RESEND_API_KEY: "chave-teste" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfiguracaoAusente);
      expect((e as ConfiguracaoAusente).variaveis).toEqual(["RESEND_WEBHOOK_SECRET", "ATTA_EMAIL_REMETENTE"]);
      expect(String(e)).not.toContain("chave-teste");
    }
  });

  it("modo real com as variáveis usa a Resend", () => {
    const p = montarProvedoresMensagem({
      ATTA_EMAIL_MODO: "real",
      RESEND_API_KEY: "k",
      RESEND_WEBHOOK_SECRET: "whsec_eA==",
      ATTA_EMAIL_REMETENTE: "ATTA <a@b.test>",
    });
    expect(p.email.nome).toBe("resend");
  });
});
