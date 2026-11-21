import { describe, expect, it } from "vitest";
import { lerComTeto } from "./ler-com-teto";

/** Requisição com cabeçalhos livres (o Request do Node não deixa forjar o Content-Length) e corpo em pedaços. */
function req(pedacos: string[], cabecalhos: Record<string, string> = {}): Request {
  const bytes = pedacos.map((p) => new TextEncoder().encode(p));
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const b of bytes) c.enqueue(b);
      c.close();
    },
  });
  return { headers: new Headers(cabecalhos), body } as unknown as Request;
}

describe("ler o corpo com teto", () => {
  it("devolve o corpo dentro do teto, mesmo em pedaços", async () => {
    expect(await lerComTeto(req(['{"a":', "1}"]), 100)).toBe('{"a":1}');
  });

  it("recusa pelo Content-Length declarado", async () => {
    expect(await lerComTeto(req(["x"], { "content-length": "1000" }), 100)).toBeNull();
  });

  it("recusa durante a leitura quando o cabeçalho mente", async () => {
    expect(await lerComTeto(req(["x".repeat(60), "x".repeat(60)], { "content-length": "10" }), 100)).toBeNull();
  });

  it("sem corpo devolve texto vazio", async () => {
    expect(await lerComTeto({ headers: new Headers(), body: null } as unknown as Request, 100)).toBe("");
  });
});
