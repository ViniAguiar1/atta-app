import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Comparação em tempo constante de duas strings. */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hmacSha256(chave: Buffer | string, conteudo: string, saida: "hex" | "base64"): string {
  return createHmac("sha256", chave).update(conteudo, "utf8").digest(saida);
}
