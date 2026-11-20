import { z } from "zod";

// Bordas do Boarding Check (MIG-53; PDD v206 §10.2.3). O PIN só trafega no corpo da server action, nunca na URL.
export const pinSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

/** O que a tela do PIN recebe. Sem o segredo da sessão: ele fica no cookie HttpOnly, gravado pela action. */
export type DesfechoDoPin =
  | { status: "ok" }
  | { status: "pin_incorreto" }
  | { status: "bloqueado"; minutos: number }
  | { status: "indisponivel" };

/** Minutos que faltam até o fim do bloqueio, arredondados para cima (mínimo 1). Calculado no servidor. */
export function minutosAte(bloqueadoAte: string, agora = Date.now()): number {
  return Math.max(1, Math.ceil((Date.parse(bloqueadoAte) - agora) / 60_000));
}
