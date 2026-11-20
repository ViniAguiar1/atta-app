import "server-only";
/**
 * Monta os provedores de mensagem a partir do ambiente. Padrão: simulador em todo canal.
 * `ATTA_EMAIL_MODO=real` liga a Resend; sem as variáveis, falha na partida (nunca cai no simulador sem avisar).
 * WhatsApp e SMS ficam no simulador até o dono aprovar provedor e conta (MIG-31).
 */
import { EmailResend } from "../email/resend";
import type { ProvedorMensagem } from "./porta";
import { SimuladorMensageria } from "./simulador";
import type { Canal } from "./tipos";

type Ambiente = Readonly<Record<string, string | undefined>>;

export class ConfiguracaoAusente extends Error {
  constructor(readonly variaveis: readonly string[]) {
    super(`integração em modo real sem as variáveis: ${variaveis.join(", ")}`);
  }
}

const VARIAVEIS_EMAIL = ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "ATTA_EMAIL_REMETENTE"] as const;

export function montarProvedoresMensagem(env: Ambiente): Readonly<Record<Canal, ProvedorMensagem>> {
  let email: ProvedorMensagem = new SimuladorMensageria("email");
  if (env.ATTA_EMAIL_MODO === "real") {
    const faltando = VARIAVEIS_EMAIL.filter((n) => !env[n]);
    if (faltando.length) throw new ConfiguracaoAusente(faltando);
    email = new EmailResend({
      apiKey: env.RESEND_API_KEY!,
      webhookSecret: env.RESEND_WEBHOOK_SECRET!,
      remetente: env.ATTA_EMAIL_REMETENTE!,
    });
  }
  return { email, whatsapp: new SimuladorMensageria("whatsapp"), sms: new SimuladorMensageria("sms") };
}
