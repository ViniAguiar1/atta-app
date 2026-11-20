import "server-only";
/**
 * Trava do envio real enquanto a nuvem só tem dado fictício (ADR 0005 §1, Tech Lead, 20/11, #94).
 *
 * O stage tem pacientes fictícios com celular de formato válido, e um número desses pode ser de alguém. Por isso todo
 * provedor real (WhatsApp, SMS, e-mail) passa por este invólucro: só sai mensagem para destino cujo HMAC está em
 * `ATTA_ENVIO_PERMITIDOS` (os números e e-mails do time, nunca o valor cru). Destino fora da lista volta como falha
 * permanente `bloqueado_stage`, que a fila registra e não repete. E-mail em `@exemplo.test` nunca sai, nem na lista.
 *
 * HMAC-SHA256 com o `ATTA_CPF_PEPPER` (sem variável nova), com rótulo de domínio:
 * - telefone: `atta.telefone.v1|<E.164>`, ex.: `atta.telefone.v1|+5511900000000`;
 * - e-mail: o mesmo `emailHmacWith` da busca por e-mail (`atta.email.v1|<e-mail normalizado>`).
 */
import { createHmac } from "node:crypto";
import { emailHmacWith, normalizeEmail } from "@/server/crypto/email";
import { falhaProvedor, type ResultadoProvedor } from "../comum/resultado-provedor";
import type { ProvedorMensagem, RequisicaoWebhook } from "./porta";
import type { MensagemRenderizada, RetornoEntrega } from "./tipos";

const ROTULO_TELEFONE = "atta.telefone.v1|";
const E164 = /^\+[1-9]\d{7,14}$/;
const HMAC_HEX = /^[0-9a-f]{64}$/;
const DOMINIO_DE_TESTE = "@exemplo.test";

export class ListaDePermitidosInvalida extends Error {
  constructor(motivo: string) {
    // nunca repete o valor da variável
    super(`ATTA_ENVIO_PERMITIDOS ou ATTA_CPF_PEPPER inválido: ${motivo}`);
  }
}

/** HMAC (hex) de um destino, no formato que vai em `ATTA_ENVIO_PERMITIDOS`. `null` se o destino está fora da forma. */
export function hmacDoDestino(pepper: Uint8Array, canal: MensagemRenderizada["canal"], para: string): string | null {
  if (canal === "email") {
    const email = normalizeEmail(para);
    return email ? emailHmacWith(pepper, email).toString("hex") : null;
  }
  if (!E164.test(para)) return null;
  return createHmac("sha256", pepper)
    .update(ROTULO_TELEFONE + para, "utf8")
    .digest("hex");
}

/** Lê o pepper (hex, ≥ 32 bytes) e a lista (HMACs hex separados por vírgula, espaço ou quebra de linha). */
export function lerListaDePermitidos(
  pepperHex: string,
  lista: string,
): { readonly pepper: Buffer; readonly hmacs: ReadonlySet<string> } {
  if (!/^([0-9a-f]{2}){32,}$/.test(pepperHex)) throw new ListaDePermitidosInvalida("pepper fora do formato");
  const itens = lista
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (itens.some((h) => !HMAC_HEX.test(h))) throw new ListaDePermitidosInvalida("item que não é HMAC-SHA256 em hex");
  return { pepper: Buffer.from(pepperHex, "hex"), hmacs: new Set(itens) };
}

/** Provedor real atrás da lista de permitidos. O webhook passa direto: o retorno só cita envios que já saíram. */
export class ProvedorComListaDePermitidos implements ProvedorMensagem {
  readonly canal: ProvedorMensagem["canal"];
  readonly nome: string;

  constructor(
    private readonly provedor: ProvedorMensagem,
    private readonly pepper: Uint8Array,
    private readonly hmacs: ReadonlySet<string>,
  ) {
    this.canal = provedor.canal;
    this.nome = provedor.nome;
  }

  enviar(mensagem: MensagemRenderizada): Promise<ResultadoProvedor<{ readonly idExterno: string }>> {
    if (!this.permitido(mensagem)) {
      return Promise.resolve(
        falhaProvedor("permanente", "bloqueado_stage", "envio bloqueado: destino fora da lista de permitidos"),
      );
    }
    return this.provedor.enviar(mensagem);
  }

  interpretarRetorno(requisicao: RequisicaoWebhook): ResultadoProvedor<readonly RetornoEntrega[]> {
    return this.provedor.interpretarRetorno(requisicao);
  }

  private permitido(m: MensagemRenderizada): boolean {
    if (m.canal !== this.canal) return false;
    if (m.canal === "email" && m.para.trim().toLowerCase().endsWith(DOMINIO_DE_TESTE)) return false;
    const hmac = hmacDoDestino(this.pepper, m.canal, m.para);
    return hmac !== null && this.hmacs.has(hmac);
  }
}
