import type { EmailOtpType } from "@supabase/supabase-js";

// Só os dois tipos que o app manda por e-mail; token_hash no formato do Auth.
export const TIPOS_DE_LINK: ReadonlySet<string> = new Set(["recovery", "invite"]);

export function linkValido(tokenHash: unknown, tipo: unknown): tipo is EmailOtpType {
  return (
    typeof tokenHash === "string" && /^[A-Za-z0-9_-]{8,200}$/.test(tokenHash) && typeof tipo === "string" && TIPOS_DE_LINK.has(tipo)
  );
}
