/**
 * CPF no servidor (ADR 0002 §6; RFC-0013; porte de `atta_core.crypto.documento` e `atta_core.ids.mascara`).
 * Dono: Backend 3. Usado pelo Backend 2 no MIG-12. O banco não calcula HMAC, não cifra e não mascara.
 *
 * Ordem na server action: normalizeCpf → isValidCpf → cpfHmac (coluna UNIQUE de busca) + cifra no
 * getCofre('network') (cpf_enc) + maskCpf (cpf_masked). Nenhuma mensagem de erro repete o valor (PII classe 4).
 */
import "server-only";
import { createHmac } from "node:crypto";
import { pepperFromEnv } from "./pepper";

const CANONICAL = /^[0-9]{11}$/; // [0-9], não \d: \d aceita dígito de outros alfabetos
const TYPED = /^[0-9.\-\s]+$/; // o que a pessoa digita: dígitos, ponto, hífen e espaço

/** `123.456.789-01`, ` 12345678901 ` → `12345678901`; qualquer outra coisa → null. */
export function normalizeCpf(input: string): string | null {
  if (typeof input !== "string" || input.length > 32 || !TYPED.test(input)) return null;
  const digits = input.replace(/[.\-\s]/g, "");
  return CANONICAL.test(digits) ? digits : null;
}

/** Dígitos verificadores da Receita; sequência de dígitos iguais é inválida (RFC-0013, `ATTA-REG-0101`). */
export function isValidCpf(cpf: string): boolean {
  if (!CANONICAL.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const d = [...cpf].map(Number);
  const dv = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += d[i]! * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

/** HMAC-SHA256 dos 11 dígitos com um pepper explícito (testes e job de rotação). Não exige DV válido. */
export function cpfHmacWith(pepper: Uint8Array, cpf: string): Buffer {
  if (!CANONICAL.test(cpf)) throw new RangeError("CPF fora da forma canônica de 11 dígitos");
  if (pepper.length < 32) throw new RangeError("pepper precisa de pelo menos 32 bytes");
  return createHmac("sha256", pepper).update(cpf, "ascii").digest();
}

/** `cpf_hmac` com `ATTA_CPF_PEPPER` (hex, ≥ 32 bytes; segredo de servidor, nunca no banco). */
export function cpfHmac(cpf: string): Buffer {
  return cpfHmacWith(pepperFromEnv("ATTA_CPF_PEPPER"), cpf);
}

/** `12345678901` → `***.***.789-01` (o `masked` do ADR 0006 §3). */
export function maskCpf(cpf: string): string {
  if (!CANONICAL.test(cpf)) throw new RangeError("CPF fora da forma canônica de 11 dígitos");
  return `***.***.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

// RNE e RNM/CRNM fazem parte do mesmo contrato da ADR 0002 §6; o pepper deles é o ATTA_RNE_PEPPER, não o do CPF.
export {
  FOREIGN_DOC_KINDS,
  isForeignDocKind,
  isValidRne,
  maskRne,
  normalizeRne,
  rneHmac,
  rneHmacWith,
  type ForeignDocKind,
} from "./rne";
