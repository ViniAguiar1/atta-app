import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Política do grant de sessão (ADR 0004 §3). Os números espelham `private.grant_policy` no banco, que é quem decide
 * de verdade (`private.grant_is_valid`): aqui eles servem para o `Max-Age` do cookie e para a tela. Se o PDD ou a PO
 * mudarem a validade, muda aqui e na migration, nos dois lugares, com o teste de paridade abaixo.
 */
export const FINALIDADES = ["patient_checkin", "professional_boarding"] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const POLITICA: Readonly<Record<Finalidade, { inatividadeSeg: number | null; tetoSeg: number }>> = {
  // paciente: 30 min sem uso, renovada a cada ação, com teto de 2 h
  patient_checkin: { inatividadeSeg: 30 * 60, tetoSeg: 2 * 60 * 60 },
  // profissional: provisório até a PO decidir; teto de 12 h (o fim do atendimento também encerra, no banco)
  professional_boarding: { inatividadeSeg: null, tetoSeg: 12 * 60 * 60 },
};

export const COOKIE_GRANT = "atta_grant";

/** Segredo do grant: 32 bytes de gerador criptográfico, em base64url. Vai só no cookie (ou no fragmento do link). */
export function gerarSegredo(): string {
  return randomBytes(32).toString("base64url");
}

/** O banco guarda e procura só o sha256 do segredo. Segredo fora do formato não vira hash (não consulta o banco). */
export function hashDoSegredo(segredo: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(segredo)) return null;
  return createHash("sha256").update(Buffer.from(segredo, "base64url")).digest();
}

/** Opções do cookie: HttpOnly, Secure, SameSite=Lax, Path=/ e sem Domain (fica só no host, ADR 0004 §3). */
export function opcoesDoCookie(finalidade: Finalidade) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: POLITICA[finalidade].tetoSeg,
  };
}
