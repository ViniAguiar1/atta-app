// Cookie da sessão (ADR 0001 §4, decisão do Tech Lead em 20/11): HttpOnly, SameSite=Lax e Secure fora do http local.
// Num lugar só, aplicado pelo cliente de servidor e pelo proxy. Com HttpOnly, o navegador não lê a sessão: toda leitura
// e escrita autenticada passa por Server Component ou server action; o cliente do navegador fica só para o público.
export function opcoesDoCookieDeSessao(https: boolean) {
  return { httpOnly: true, secure: https, sameSite: "lax", path: "/" } as const;
}
