/**
 * Documento de estrangeiro, equivalente ao CPF (ADR 0002 §6). Regra do dono (PLANO, 20/11): aceita RNE (antigo) e
 * RNM/CRNM, como letras e dígitos, SEM conferir dígito verificador.
 *   - normalizeRne: tira ponto, hífen, barra e espaço, põe em maiúsculas; só letra e dígito ASCII, 5 a 15 posições;
 *   - isValidRne: só essa estrutura (não há DV a conferir);
 *   - o tipo (`rne` | `rnm`) é coluna própria, fora do HMAC: o número é a identidade, o tipo é metadado;
 *   - rneHmac: HMAC-SHA256 com pepper próprio (`ATTA_RNE_PEPPER`, nunca o do CPF);
 *   - maskRne: só os 3 últimos à mostra, com o ponto médio do maskCpf.
 * Nenhuma mensagem de erro repete o valor.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { pepperFromEnv } from "./pepper";

const MASK_CHAR = "\u00b7"; // o mesmo ponto médio do maskCpf

export const FOREIGN_DOC_KINDS = ["rne", "rnm"] as const; // rnm cobre RNM e CRNM
export type ForeignDocKind = (typeof FOREIGN_DOC_KINDS)[number];

const CANONICAL = /^[A-Z0-9]{5,15}$/;
const TYPED = /^[A-Za-z0-9.\-/\s]+$/;

export function isForeignDocKind(value: unknown): value is ForeignDocKind {
  return typeof value === "string" && (FOREIGN_DOC_KINDS as readonly string[]).includes(value);
}

export function normalizeRne(input: string): string | null {
  if (typeof input !== "string" || input.length > 32 || !TYPED.test(input)) return null;
  const canonical = input.replace(/[.\-/\s]/g, "").toUpperCase();
  return CANONICAL.test(canonical) ? canonical : null;
}

export function isValidRne(rne: string): boolean {
  return CANONICAL.test(rne);
}

export function rneHmacWith(pepper: Uint8Array, rne: string): Buffer {
  if (!CANONICAL.test(rne)) throw new RangeError("RNE/RNM fora da forma canônica");
  if (pepper.length < 32) throw new RangeError("pepper precisa de pelo menos 32 bytes");
  return createHmac("sha256", pepper).update(rne, "ascii").digest();
}

export function rneHmac(rne: string): Buffer {
  return rneHmacWith(pepperFromEnv("ATTA_RNE_PEPPER"), rne);
}

export function maskRne(rne: string): string {
  if (!CANONICAL.test(rne)) throw new RangeError("RNE/RNM fora da forma canônica");
  return MASK_CHAR.repeat(rne.length - 3) + rne.slice(-3);
}
