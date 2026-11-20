// Origem pública da requisição (esquema + host) para os redirecionamentos dos route handlers. O request.nextUrl.origin
// pode vir com o host em que o servidor escuta (ex.: localhost) e não com o que o navegador usou, e aí o cookie da
// sessão, gravado no host do navegador, se perde no redirecionamento. Na Vercel, x-forwarded-proto e host vêm da borda.
export function origemPublica(cabecalhos: Headers, reserva: URL): string {
  const host = cabecalhos.get("host") ?? reserva.host;
  const proto = cabecalhos.get("x-forwarded-proto") ?? reserva.protocol.replace(":", "");
  return `${proto === "https" ? "https" : "http"}://${host}`;
}
