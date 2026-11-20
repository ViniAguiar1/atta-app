/**
 * JSON Canonicalization Scheme (RFC 8785): a serialização do payload do ATTA Sign que um terceiro reproduz
 * (ADR 0006 §2). Porte de `atta_core.crypto.jcs`, preso pelos vetores de `tests/vectors/rfc8785` e
 * `tests/vectors/atta_sign_v1`.
 *
 * Feito em casa, sem dependência, porque o algoritmo é parte do invariante jurídico (ADR 0006 item 10).
 * Falha fechada: NaN, infinito, surrogate solto e tipo sem forma JSON lançam erro. Nenhuma mensagem repete o valor,
 * porque o payload carrega PII. Inteiro fora do intervalo seguro é barrado pelo esquema do payload (attasign.ts),
 * não aqui: no JS todo número já é double, e o RFC serializa o double como está.
 */

export type Json = null | boolean | number | string | Json[] | { [chave: string]: Json };

export function canonicalize(valor: unknown): Uint8Array {
  return new TextEncoder().encode(serialize(valor));
}

export function canonicalizeToString(valor: unknown): string {
  return serialize(valor);
}

function serialize(valor: unknown): string {
  if (valor === null) return "null";
  if (valor === true) return "true";
  if (valor === false) return "false";
  if (typeof valor === "number") return serializeNumber(valor);
  if (typeof valor === "string") return serializeString(valor);
  if (Array.isArray(valor)) return "[" + valor.map(serialize).join(",") + "]";
  if (isPlainObject(valor)) return serializeObject(valor);
  // undefined, Date, Map, BigInt, função: sem forma JSON; quem monta o payload serializa antes
  throw new TypeError("valor sem forma JSON (RFC 8785 §3.2)");
}

function isPlainObject(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== "object" || valor === null) return false;
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError("NaN e Infinity não existem em JSON (RFC 8785 §3.2.2.3)");
  // Number.prototype.toString do ES6 é a definição do RFC; -0 vira "0"
  return Object.is(n, -0) ? "0" : String(n);
}

function serializeString(s: string): string {
  if (!s.isWellFormed()) throw new RangeError("texto com surrogate solto não é Unicode válido (RFC 8785 §3.2.2.2)");
  // JSON.stringify de string é exatamente o escape do ECMAScript que o RFC pede (controle em \u00xx minúsculo)
  return JSON.stringify(s);
}

function serializeObject(o: Record<string, unknown>): string {
  const chaves = Object.keys(o);
  for (const chave of chaves) serializeString(chave); // surrogate solto em chave também falha
  // ordem por unidade de código UTF-16 (§3.2.3): a comparação padrão de string do JS já é essa
  chaves.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + chaves.map((chave) => serializeString(chave) + ":" + serialize(o[chave])).join(",") + "}";
}
