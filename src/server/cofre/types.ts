// Interface do Cofre (ADR 0002 do atta-app, Tech Lead, versão sem serviço externo de 20/11).
import "server-only";

/** Liga a chave ao lugar onde ela é usada; entra na AAD do envelope. */
export type CofreContext = Readonly<{
  tenant_id: string; // '' para dado de rede (sem tenant)
  table: string; // 'health.answer'
  column: string; // 'value'
  id: string; // id da linha
}>;

export type WrappedKey = Readonly<{
  kekVersion: number; // n de k<n>; gravado na linha (kek_version smallint)
  blob: Uint8Array; // DEK envelopada (contêiner do formato 1)
}>;

export interface Cofre {
  /** DEK nova de 32 bytes: em claro (só em memória; quem usa zera com fill(0)) e envelopada pela KEK ativa. */
  generateDataKey(ctx: CofreContext): Promise<{ plaintext: Uint8Array; wrapped: WrappedKey }>;
  /** Abre uma DEK guardada com a KEK da versão gravada; o contexto precisa ser idêntico. Senão, CryptoError. */
  unwrapDataKey(wrapped: WrappedKey, ctx: CofreContext): Promise<Uint8Array>;
}
