import "server-only";
/**
 * Adaptador de WhatsApp: WhatsApp Business Cloud API da Meta, direto, sem intermediário (PDD 10.2.1: "WhatsApp via
 * API oficial"). Só modelos aprovados: fora da janela de 24 h não existe texto livre, e o catálogo fechado
 * (`mensageria/modelos.ts`) é a trava da RN-NOT-01.
 *
 * Contrato conferido na doc oficial da Meta em 20/11/2026:
 * - Graph API v27.0 (04/11/2026); POST /{phone-number-id}/messages com `type: "template"`;
 * - modelo de autenticação com botão de copiar: o código vai no corpo e no botão (`sub_type: "url"`, índice "0");
 * - webhook: `X-Hub-Signature-256: sha256=<hex>`, HMAC-SHA256 do corpo com o App Secret; verificação por GET com
 *   `hub.mode=subscribe`, `hub.verify_token` e `hub.challenge`;
 * - status em `entry[].changes[].value.statuses[]`; cobrança por mensagem entregue desde 01/07/2025: `pricing.type`
 *   `regular` é cobrável (o `pricing.billable` ainda vem, mas será descontinuado).
 * A Cloud API não aceita chave de idempotência: a fila evita o envio duplo pelo lease (ADR 0028).
 * Variáveis: ATTA_WHATSAPP_ACCESS_TOKEN, ATTA_WHATSAPP_PHONE_NUMBER_ID, ATTA_WHATSAPP_APP_SECRET e
 * ATTA_WHATSAPP_WEBHOOK_VERIFY_TOKEN (o dono cadastra quando a conta da Meta for aprovada).
 */
import { hmacSha256, iguaisEmTempoConstante } from "../comum/assinatura-webhook";
import {
  falhaPorStatusHttp,
  falhaProvedor,
  okProvedor,
  type ResultadoProvedor,
  type TipoFalha,
} from "../comum/resultado-provedor";
import type { ProvedorMensagem, RequisicaoWebhook } from "../mensageria/porta";
import type { MensagemRenderizada, RetornoEntrega } from "../mensageria/tipos";

export const VERSAO_GRAPH = "v27.0";
const TEMPO_LIMITE_MS = 10_000;
const E164 = /^\+[1-9]\d{7,14}$/;

export interface ConfigWhatsAppMeta {
  readonly accessToken: string;
  readonly phoneNumberId: string;
  readonly appSecret: string;
  readonly verifyToken: string;
  readonly versaoGraph?: string;
  readonly fetch?: typeof fetch;
}

/**
 * Códigos de erro da Cloud API (página "Error codes"), pelo que adianta fazer:
 * - configuração: token, permissão, conta restrita, pagamento, número não registrado e modelo não aprovado, pausado
 *   ou desativado. Repetir não resolve; alguém precisa agir na conta;
 * - transitória: limite de vazão e indisponibilidade. A fila tenta de novo;
 * - permanente: problema desta mensagem ou deste destinatário. Não repete, e o WhatsApp falho vai para o SMS.
 */
const ERROS: Readonly<Record<TipoFalha, ReadonlySet<number>>> = {
  configuracao: new Set([0, 3, 10, 190, 368, 131005, 131031, 131042, 130497, 132001, 132015, 132016, 133010]),
  transitoria: new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131048, 131056, 133004]),
  permanente: new Set([
    100, 131021, 131026, 131047, 131049, 131050, 131051, 131062, 130403, 132000, 132005, 132007, 132012, 135000,
  ]),
};

function tipoDoErro(codigo: number): TipoFalha | undefined {
  if (codigo >= 200 && codigo <= 299) return "configuracao"; // permissões da API
  return (Object.keys(ERROS) as TipoFalha[]).find((t) => ERROS[t].has(codigo));
}

const ESTADOS: Readonly<Record<string, RetornoEntrega["estado"]>> = {
  sent: "enviado",
  delivered: "entregue",
  read: "lido",
  failed: "falhou",
};

interface StatusMeta {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly timestamp?: unknown;
  readonly errors?: readonly { readonly code?: unknown }[];
  readonly pricing?: { readonly billable?: unknown; readonly type?: unknown };
}

export class WhatsAppMetaCloud implements ProvedorMensagem {
  readonly canal = "whatsapp" as const;
  readonly nome = "meta-cloud";

  constructor(private readonly config: ConfigWhatsAppMeta) {}

  async enviar(m: MensagemRenderizada): Promise<ResultadoProvedor<{ readonly idExterno: string }>> {
    if (m.canal !== "whatsapp" || !m.whatsapp)
      return falhaProvedor("permanente", "mensagem_invalida", "whatsapp: sem modelo");
    if (!E164.test(m.para)) return falhaProvedor("permanente", "destinatario_invalido", "whatsapp: telefone inválido");
    const w = m.whatsapp;
    const componentes: unknown[] = [
      {
        type: "body",
        parameters: w.parametros.map((text) => ({ type: "text", text })),
      },
    ];
    if (w.codigoNoBotao)
      componentes.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: w.codigoNoBotao }],
      });

    const versao = this.config.versaoGraph ?? VERSAO_GRAPH;
    let resposta: Response;
    try {
      resposta = await (this.config.fetch ?? fetch)(
        `https://graph.facebook.com/${versao}/${encodeURIComponent(this.config.phoneNumberId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: m.para.slice(1),
            type: "template",
            template: {
              name: w.modelo,
              language: { code: w.idioma },
              components: componentes,
            },
          }),
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        },
      );
    } catch {
      return falhaProvedor("transitoria", "rede", "whatsapp: falha de rede ou tempo esgotado");
    }
    const corpo = (await resposta.json().catch(() => ({}))) as {
      messages?: { id?: unknown }[];
      error?: { code?: unknown };
    };
    if (!resposta.ok) {
      const codigo = corpo.error?.code;
      const tipo = typeof codigo === "number" ? tipoDoErro(codigo) : undefined;
      // só o código numérico: a mensagem da Meta pode repetir o número do destinatário
      if (tipo) return falhaProvedor(tipo, `whatsapp_${String(codigo)}`, "whatsapp: pedido recusado pela Meta");
      return falhaPorStatusHttp(resposta.status, "whatsapp");
    }
    const id = corpo.messages?.[0]?.id;
    return typeof id === "string" && id
      ? okProvedor({ idExterno: id })
      : falhaProvedor("transitoria", "resposta_sem_id", "whatsapp: resposta sem id");
  }

  /** GET de verificação do webhook: devolve o `hub.challenge` se o token confere, ou `null` (a rota responde 403). */
  responderVerificacao(params: URLSearchParams): string | null {
    const token = params.get("hub.verify_token") ?? "";
    const desafio = params.get("hub.challenge");
    if (params.get("hub.mode") !== "subscribe" || !desafio) return null;
    return iguaisEmTempoConstante(token, this.config.verifyToken) ? desafio : null;
  }

  /** POST de status: confere `X-Hub-Signature-256` sobre o corpo exato e traduz cada status. */
  interpretarRetorno(req: RequisicaoWebhook): ResultadoProvedor<readonly RetornoEntrega[]> {
    const assinatura = req.cabecalhos["x-hub-signature-256"] ?? "";
    const esperada = `sha256=${hmacSha256(this.config.appSecret, req.corpo, "hex")}`;
    if (!iguaisEmTempoConstante(assinatura, esperada))
      return falhaProvedor("permanente", "assinatura_invalida", "whatsapp: assinatura não confere");

    let dados: {
      entry?: { changes?: { value?: { statuses?: StatusMeta[] } }[] }[];
    };
    try {
      dados = JSON.parse(req.corpo);
    } catch {
      return falhaProvedor("permanente", "corpo_invalido", "whatsapp: corpo inválido");
    }
    const retornos: RetornoEntrega[] = [];
    for (const entrada of dados.entry ?? [])
      for (const mudanca of entrada.changes ?? [])
        for (const s of mudanca.value?.statuses ?? []) {
          // mensagens recebidas e status fora da lista (ex.: `played`) não mudam a entrega
          const estado = typeof s.status === "string" ? ESTADOS[s.status] : undefined;
          const segundos = typeof s.timestamp === "string" ? Number(s.timestamp) : NaN;
          if (!estado || typeof s.id !== "string" || !s.id || !Number.isFinite(segundos)) continue;
          const codigoFalha = s.errors?.[0]?.code;
          const cobravel =
            typeof s.pricing?.type === "string"
              ? s.pricing.type === "regular"
              : typeof s.pricing?.billable === "boolean"
                ? s.pricing.billable
                : undefined;
          retornos.push({
            canal: "whatsapp",
            idExterno: s.id,
            estado,
            quando: new Date(segundos * 1000),
            ...(estado === "falhou" && typeof codigoFalha === "number"
              ? { codigoFalha: `whatsapp_${codigoFalha}` }
              : {}),
            ...(cobravel !== undefined ? { cobravel } : {}),
          });
        }
    return okProvedor(retornos);
  }
}
