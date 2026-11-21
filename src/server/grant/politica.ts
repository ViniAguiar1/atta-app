import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * Política do grant de sessão (ADR 0004 §3). Os números espelham `private.grant_policy` no banco, que é quem decide
 * de verdade (`private.grant_is_valid`): aqui eles servem para o `Max-Age` do cookie e para a tela. Se o PDD ou a PO
 * mudarem a validade, muda aqui e na migration, nos dois lugares, com o teste de paridade abaixo.
 */
export const FINALIDADES = ["patient_checkin", "professional_boarding", "professional_propass", "propass_download"] as const;
export type Finalidade = (typeof FINALIDADES)[number];

export const POLITICA: Readonly<Record<Finalidade, { inatividadeSeg: number | null; tetoSeg: number }>> = {
  // paciente: 30 min sem uso, renovada a cada ação, com teto de 2 h (ADR 0004 §3)
  patient_checkin: { inatividadeSeg: 30 * 60, tetoSeg: 2 * 60 * 60 },
  // profissional: 8 h a partir do envio do link pelo WhatsApp, ou a conclusão, ou o cancelamento (PDD RN-FIC-07)
  professional_boarding: { inatividadeSeg: null, tetoSeg: 8 * 60 * 60 },
  // PROpass: o link do convite vale 7 dias da emissão; o reenvio invalida o anterior (PDD v206 §10.4.3)
  professional_propass: { inatividadeSeg: null, tetoSeg: 7 * 24 * 60 * 60 },
  // download dos PDFs do fim do PROpass: 30 min absolutos, sem renovar por uso (ADR 0001, "Download dos PDFs")
  propass_download: { inatividadeSeg: null, tetoSeg: 30 * 60 },
};

/** Teto de usos (private.grant_max_uses): o download dos PDFs do PROpass vale no máximo 20 vezes. Sem chave = sem teto. */
export const MAX_USOS: Readonly<Partial<Record<Finalidade, number>>> = { propass_download: 20 };

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

/**
 * Opções do cookie: HttpOnly, SameSite=Lax, Path=/ e sem Domain (fica só no host, ADR 0004 §3). Secure em https, como
 * o cookie da sessão (ADR 0001 §4): fixo, quebraria o http://127.0.0.1 local no Safari.
 */
export function opcoesDoCookie(finalidade: Finalidade, https: boolean) {
  return {
    httpOnly: true,
    secure: https,
    sameSite: "lax" as const,
    path: "/",
    maxAge: POLITICA[finalidade].tetoSeg,
  };
}
