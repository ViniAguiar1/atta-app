import "server-only";
/**
 * Monta os provedores de mensagem a partir do ambiente. Padrão: simulador em todo canal.
 * `ATTA_EMAIL_MODO=real` liga a Resend e `ATTA_WHATSAPP_MODO=real` liga a Cloud API da Meta; sem as variáveis, falha
 * na partida (nunca cai no simulador sem avisar). O SMS fica no simulador até o dono escolher o provedor (MIG-31).
 *
 * Todo provedor real passa pela lista de permitidos (ADR 0005 §1): enquanto a nuvem só tem dado fictício, modo real
 * exige `ATTA_ENVIO_PERMITIDOS` e `ATTA_CPF_PEPPER`. A trava só sai junto com o projeto de produção (São Paulo).
 */
import { EmailResend } from "../email/resend";
import { WhatsAppMetaCloud } from "../whatsapp/meta-cloud";
import { lerListaDePermitidos, ProvedorComListaDePermitidos } from "./envio-permitido";
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
const VARIAVEIS_WHATSAPP = [
  "ATTA_WHATSAPP_ACCESS_TOKEN",
  "ATTA_WHATSAPP_PHONE_NUMBER_ID",
  "ATTA_WHATSAPP_APP_SECRET",
  "ATTA_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
] as const;
const VARIAVEIS_TRAVA = ["ATTA_ENVIO_PERMITIDOS", "ATTA_CPF_PEPPER"] as const;

// lista de permitidos vazia conta como presente: bloqueia todo destino, que é o lado seguro
const ausente = (env: Ambiente, nome: string) =>
  nome === "ATTA_ENVIO_PERMITIDOS" ? env[nome] === undefined : !env[nome];

export function montarProvedoresMensagem(env: Ambiente): Readonly<Record<Canal, ProvedorMensagem>> {
  const emailReal = env.ATTA_EMAIL_MODO === "real";
  const whatsappReal = env.ATTA_WHATSAPP_MODO === "real";
  if (!emailReal && !whatsappReal)
    return {
      email: new SimuladorMensageria("email"),
      whatsapp: new SimuladorMensageria("whatsapp"),
      sms: new SimuladorMensageria("sms"),
    };

  const faltando = [
    ...(emailReal ? VARIAVEIS_EMAIL : []),
    ...(whatsappReal ? VARIAVEIS_WHATSAPP : []),
    ...VARIAVEIS_TRAVA,
  ].filter((n) => ausente(env, n));
  if (faltando.length) throw new ConfiguracaoAusente(faltando);

  const { pepper, hmacs } = lerListaDePermitidos(env.ATTA_CPF_PEPPER!, env.ATTA_ENVIO_PERMITIDOS!);
  const travar = (p: ProvedorMensagem) => new ProvedorComListaDePermitidos(p, pepper, hmacs);

  return {
    email: emailReal
      ? travar(
          new EmailResend({
            apiKey: env.RESEND_API_KEY!,
            webhookSecret: env.RESEND_WEBHOOK_SECRET!,
            remetente: env.ATTA_EMAIL_REMETENTE!,
          }),
        )
      : new SimuladorMensageria("email"),
    whatsapp: whatsappReal
      ? travar(
          new WhatsAppMetaCloud({
            accessToken: env.ATTA_WHATSAPP_ACCESS_TOKEN!,
            phoneNumberId: env.ATTA_WHATSAPP_PHONE_NUMBER_ID!,
            appSecret: env.ATTA_WHATSAPP_APP_SECRET!,
            verifyToken: env.ATTA_WHATSAPP_WEBHOOK_VERIFY_TOKEN!,
          }),
        )
      : new SimuladorMensageria("whatsapp"),
    sms: new SimuladorMensageria("sms"),
  };
}
