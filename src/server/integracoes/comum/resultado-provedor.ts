import "server-only";
/**
 * Resultado interno dos adaptadores de provedor (ADR 0005 §3). Não confundir com o `Resultado` de `@/lib/errors`,
 * que é o das bordas: este classifica a falha em transitória, permanente ou de configuração e nunca sai de
 * `src/server/integracoes/`.
 *
 * Regra: a mensagem de uma falha nunca leva dado pessoal (telefone, e-mail, CPF, nome)
 * nem corpo de resposta do provedor. Só tipo, código curto e texto técnico genérico.
 */

/** transitoria: tentar de novo; permanente: não adianta repetir; configuracao: falta chave/conta. */
export type TipoFalha = "transitoria" | "permanente" | "configuracao";

export interface FalhaProvedor {
  readonly tipo: TipoFalha;
  /** Código curto e estável, ex.: `http_429`, `whatsapp_131026`, `assinatura_invalida`. */
  readonly codigo: string;
  readonly mensagem: string;
}

export type ResultadoProvedor<T> =
  { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly falha: FalhaProvedor };

export const okProvedor = <T>(valor: T): ResultadoProvedor<T> => ({ ok: true, valor });

export const falhaProvedor = (tipo: TipoFalha, codigo: string, mensagem: string): ResultadoProvedor<never> => ({
  ok: false,
  falha: { tipo, codigo, mensagem },
});

/** Classificação padrão por status HTTP, usada pelos adaptadores. */
export function falhaPorStatusHttp(status: number, origem: string): ResultadoProvedor<never> {
  if (status === 401 || status === 403)
    return falhaProvedor("configuracao", `http_${status}`, `${origem}: credencial recusada`);
  // 409: pedido concorrente com a mesma chave de idempotência; o adaptador separa o conflito definitivo
  if (status === 408 || status === 409 || status === 429 || status >= 500)
    return falhaProvedor("transitoria", `http_${status}`, `${origem}: indisponível`);
  return falhaProvedor("permanente", `http_${status}`, `${origem}: pedido recusado`);
}
