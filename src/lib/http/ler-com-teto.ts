import "server-only";

/**
 * Lê o corpo de uma requisição até o teto, em bytes. Devolve `null` se passar dele, pelo Content-Length declarado ou
 * durante a leitura (o cabeçalho pode mentir). Para rotas sem sessão, como webhooks: nada acima do teto é guardado.
 */
export async function lerComTeto(request: Request, teto: number): Promise<string | null> {
  const declarado = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declarado) || declarado > teto) return null;
  if (!request.body) return "";
  const leitor = request.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(partes));
}
