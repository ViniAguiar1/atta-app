import { createHmac } from "node:crypto";

// Apoio do e2e do login. As pessoas são as do supabase/seed.sql (fictícias, só do banco local e do CI).
export const SENHA = "Senha-Ficticia-123";
export const SESSAO_DA_GESTORA = "e2e/.auth/gestora.json";

// TOTP (RFC 6238: SHA-1, 6 dígitos, passo de 30 s), para o e2e responder ao segundo fator como o app autenticador.
// O segredo da gestora é o do supabase/seed.sql: fictício e público, só do banco local e do CI.
export const SEGREDO_DA_GESTORA = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export function codigoTotp(segredoBase32: string, agora = Date.now()): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of segredoBase32.replace(/=+$/, "").toUpperCase()) bits += alfabeto.indexOf(c).toString(2).padStart(5, "0");
  const chave = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const passo = Buffer.alloc(8);
  passo.writeBigUInt64BE(BigInt(Math.floor(agora / 30_000)));
  const h = createHmac("sha1", chave).update(passo).digest();
  const desvio = (h[h.length - 1] ?? 0) & 0xf;
  return ((h.readUInt32BE(desvio) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
