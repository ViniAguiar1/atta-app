/**
 * `email_hmac` para busca (convite do profissional, MIG-14a do Backend 2; ADR 0002 §6). Dono: Backend 3.
 * normalizeEmail: trim e minúsculas, com validação básica de forma. HMAC-SHA256 com a chave ATTA_CPF_PEPPER e a entrada
 * `atta.email.v1|<email>`: o rótulo separa o domínio do HMAC do CPF (que é sobre 11 dígitos, sem rótulo), sem variável nova.
 * Nenhuma mensagem de erro repete o valor. O banco não calcula HMAC.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { pepperFromEnv } from "./pepper";

const DOMAIN_LABEL = "atta.email.v1|";
const MAX_LENGTH = 254; // RFC 5321
// forma básica: local@dominio.tld, sem espaço e com um @ só (a confirmação real é o e-mail chegar)
const SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function normalizeEmail(input: string): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_LENGTH || !SHAPE.test(email)) return null;
  return email;
}

/** HMAC com pepper explícito (testes e rotação). Recebe o e-mail já normalizado. */
export function emailHmacWith(pepper: Uint8Array, email: string): Buffer {
  if (normalizeEmail(email) !== email) throw new RangeError("e-mail fora da forma normalizada");
  if (pepper.length < 32) throw new RangeError("pepper precisa de pelo menos 32 bytes");
  return createHmac("sha256", pepper).update(DOMAIN_LABEL + email, "utf8").digest();
}

export function emailHmac(email: string): Buffer {
  return emailHmacWith(pepperFromEnv("ATTA_CPF_PEPPER"), email);
}
