// Cookie da sessão (ADR 0001 §4, decisão do Tech Lead em 20/11): HttpOnly, SameSite=Lax e Secure fora do http local.
// Num lugar só, aplicado pelo cliente de servidor e pelo proxy. Com HttpOnly, o navegador não lê a sessão: toda leitura
// e escrita autenticada passa por Server Component ou server action; o cliente do navegador fica só para o público.
export function opcoesDoCookieDeSessao(https: boolean) {
  return { httpOnly: true, secure: https, sameSite: "lax", path: "/" } as const;
}

// Cookie da última atividade (src/lib/auth/sessao.ts): as mesmas proteções, e vida máxima de uma sessão.
export function opcoesDoCookieDeAtividade(https: boolean) {
  return { ...opcoesDoCookieDeSessao(https), maxAge: 12 * 60 * 60 } as const;
}
