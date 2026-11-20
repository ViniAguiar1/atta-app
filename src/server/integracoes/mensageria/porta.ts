import "server-only";
import type { Resultado } from "../comum/resultado";
import type { Canal, MensagemRenderizada, RetornoEntrega } from "./tipos";

/** Requisição de webhook crua, para o adaptador conferir a assinatura sobre o corpo exato. */
export interface RequisicaoWebhook {
  readonly corpo: string;
  readonly cabecalhos: Readonly<Record<string, string | undefined>>; // nomes em minúsculas
}

/**
 * Porta de um provedor de mensagens (e-mail, WhatsApp ou SMS).
 * O resto do sistema só conhece esta interface; trocar Resend, Meta ou o provedor de SMS
 * é trocar o adaptador.
 */
export interface ProvedorMensagem {
  readonly canal: Canal;
  readonly nome: string;
  /** Envia uma mensagem já validada. Repetir com a mesma chave não pode duplicar no provedor, quando ele aceitar chave. */
  enviar(mensagem: MensagemRenderizada): Promise<Resultado<{ readonly idExterno: string }>>;
  /** Confere a assinatura e traduz o webhook de status. Assinatura inválida = falha `assinatura_invalida`. */
  interpretarRetorno(requisicao: RequisicaoWebhook): Resultado<readonly RetornoEntrega[]>;
}
