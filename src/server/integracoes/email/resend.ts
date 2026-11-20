import "server-only";
/**
 * Adaptador de e-mail: Resend, pela API HTTP (sem SDK). Contrato conferido na doc oficial em 20/11/2026:
 * POST /emails com `Idempotency-Key` (até 256 caracteres, guardada por 24 h); webhooks assinados no padrão Svix
 * (`svix-id`, `svix-timestamp`, `svix-signature`), com o corpo cru.
 * Variáveis: RESEND_API_KEY e RESEND_WEBHOOK_SECRET (o dono cadastra quando o e-mail for ao ar) e ATTA_EMAIL_REMETENTE.
 */
import { hmacSha256, iguaisEmTempoConstante } from "../comum/assinatura-webhook";
import { falhaPorStatusHttp, falhaProvedor, okProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { ProvedorMensagem, RequisicaoWebhook } from "../mensageria/porta";
import type { MensagemRenderizada, RetornoEntrega } from "../mensageria/tipos";

export interface ConfigResend {
  readonly apiKey: string;
  /** Formato `whsec_<base64>`, mostrado na tela do webhook na Resend. */
  readonly webhookSecret: string;
  /** Ex.: `ATTA <nao-responda@dominio-verificado>`. */
  readonly remetente: string;
  readonly fetch?: typeof fetch;
  readonly agora?: () => Date;
}

/** Tolerância do carimbo de tempo do webhook, contra reenvio de requisição capturada. */
const TOLERANCIA_S = 300;

const ESTADOS: Readonly<Record<string, RetornoEntrega["estado"]>> = {
  "email.sent": "enviado",
  "email.delivered": "entregue",
  "email.opened": "lido",
  "email.bounced": "falhou",
  "email.complained": "falhou",
  "email.failed": "falhou",
  "email.suppressed": "falhou",
};

export class EmailResend implements ProvedorMensagem {
  readonly canal = "email" as const;
  readonly nome = "resend";

  constructor(private readonly config: ConfigResend) {}

  async enviar(m: MensagemRenderizada): Promise<ResultadoProvedor<{ idExterno: string }>> {
    if (m.canal !== "email" || !m.assunto)
      return falhaProvedor("permanente", "mensagem_invalida", "resend: sem assunto");
    let resposta: Response;
    try {
      resposta = await (this.config.fetch ?? fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": m.chaveIdempotencia.slice(0, 256),
        },
        body: JSON.stringify({
          from: this.config.remetente,
          to: [m.para],
          subject: m.assunto,
          html: m.html,
          // texto vazio desliga a versão gerada a partir do HTML; aqui sempre vai a do modelo
          text: m.texto ?? "",
          ...(m.anexos?.length
            ? { attachments: m.anexos.map((a) => ({ filename: a.nome, content: a.conteudoBase64 })) }
            : {}),
        }),
      });
    } catch {
      return falhaProvedor("transitoria", "rede", "resend: falha de rede");
    }
    const corpo = (await resposta.json().catch(() => ({}))) as { id?: string; name?: string };
    if (!resposta.ok) {
      // 409 com corpo diferente para a mesma chave não se resolve repetindo; o concorrente, sim
      if (resposta.status === 409 && corpo.name === "invalid_idempotent_request")
        return falhaProvedor("permanente", "resend_idempotencia", "resend: chave reutilizada com outro conteúdo");
      if (resposta.status === 429 && /quota/.test(corpo.name ?? ""))
        return falhaProvedor("configuracao", "resend_cota", "resend: cota do plano esgotada");
      return falhaPorStatusHttp(resposta.status, "resend");
    }
    return corpo.id
      ? okProvedor({ idExterno: corpo.id })
      : falhaProvedor("transitoria", "resposta_sem_id", "resend: resposta sem id");
  }

  /** Padrão Svix: HMAC-SHA256 de `${svix-id}.${svix-timestamp}.${corpo}` com o segredo (base64 depois de `whsec_`). */
  interpretarRetorno(req: RequisicaoWebhook): ResultadoProvedor<readonly RetornoEntrega[]> {
    const id = req.cabecalhos["svix-id"];
    const ts = req.cabecalhos["svix-timestamp"];
    const assinaturas = req.cabecalhos["svix-signature"];
    if (!id || !ts || !assinaturas || !/^\d+$/.test(ts))
      return falhaProvedor("permanente", "assinatura_invalida", "resend: cabeçalhos ausentes");
    const agoraS = Math.floor((this.config.agora?.() ?? new Date()).getTime() / 1000);
    if (Math.abs(agoraS - Number(ts)) > TOLERANCIA_S)
      return falhaProvedor("permanente", "assinatura_invalida", "resend: fora da janela de tempo");

    const segredo = Buffer.from(this.config.webhookSecret.replace(/^whsec_/, ""), "base64");
    const esperada = hmacSha256(segredo, `${id}.${ts}.${req.corpo}`, "base64");
    const valida = assinaturas.split(" ").some((parte) => {
      const [versao, valor] = parte.split(",");
      return versao === "v1" && valor !== undefined && iguaisEmTempoConstante(valor, esperada);
    });
    if (!valida) return falhaProvedor("permanente", "assinatura_invalida", "resend: assinatura não confere");

    let evento: { type?: string; created_at?: string; data?: { email_id?: string } };
    try {
      evento = JSON.parse(req.corpo);
    } catch {
      return falhaProvedor("permanente", "corpo_invalido", "resend: corpo inválido");
    }
    const estado = evento.type ? ESTADOS[evento.type] : undefined;
    const idExterno = evento.data?.email_id;
    if (!estado || !idExterno) return okProvedor([]); // outros eventos (clicked, scheduled...) não mudam a entrega
    const quando = evento.created_at ? new Date(evento.created_at) : new Date(agoraS * 1000);
    return okProvedor([
      {
        canal: "email",
        idExterno,
        estado,
        quando,
        cobravel: false,
        ...(estado === "falhou" ? { codigoFalha: evento.type } : {}),
      },
    ]);
  }
}
