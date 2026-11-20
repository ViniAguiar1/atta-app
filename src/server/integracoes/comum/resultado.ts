import "server-only";
/**
 * Resultado e falhas das integrações.
 *
 * Regra: a mensagem de uma falha nunca leva dado pessoal (telefone, e-mail, CPF, nome)
 * nem corpo de resposta do provedor. Só tipo, código curto e texto técnico genérico.
 */

/** transitoria: tentar de novo; permanente: não adianta repetir; configuracao: falta chave/conta. */
export type TipoFalha = "transitoria" | "permanente" | "configuracao";

export interface Falha {
  readonly tipo: TipoFalha;
  /** Código curto e estável, ex.: `http_429`, `whatsapp_131026`, `assinatura_invalida`. */
  readonly codigo: string;
  readonly mensagem: string;
}

export type Resultado<T> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly falha: Falha };

export const ok = <T>(valor: T): Resultado<T> => ({ ok: true, valor });

export const falha = (tipo: TipoFalha, codigo: string, mensagem: string): Resultado<never> => ({
  ok: false,
  falha: { tipo, codigo, mensagem },
});

/** Classificação padrão por status HTTP, usada pelos adaptadores. */
export function falhaPorStatusHttp(status: number, origem: string): Resultado<never> {
  if (status === 401 || status === 403)
    return falha("configuracao", `http_${status}`, `${origem}: credencial recusada`);
  if (status === 408 || status === 429 || status >= 500)
    return falha("transitoria", `http_${status}`, `${origem}: indisponível`);
  return falha("permanente", `http_${status}`, `${origem}: pedido recusado`);
}
