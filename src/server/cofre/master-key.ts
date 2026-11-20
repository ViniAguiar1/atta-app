// Cofre com chaveiro de KEKs versionadas (ADR 0002): variável = `k<n>:<64 hex>[,k<m>:<64 hex>...]`,
// a primeira entrada é a ativa. A DEK vai no contêiner formato 1 com a versão da KEK no cabeçalho e a AAD
// `atta_core.crypto.data_key|tenant_id|table|column|id` (domínio + contexto): abrir em outro lugar falha.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { columnAad, CryptoError, keyVersionOf, MAX_KEY_VERSION, open, seal } from "../crypto/envelope";
import type { Cofre, CofreContext, WrappedKey } from "./types";

export type Keyring = Readonly<{ active: number; keys: ReadonlyMap<number, Uint8Array> }>;

const ENTRY = /^k([1-9][0-9]{0,4}):([0-9a-f]{64})$/;
const DOMAIN = Buffer.from("atta_core.crypto.data_key|", "ascii");

export class MasterKeyCofre implements Cofre {
  constructor(private readonly ring: Keyring) {
    if (!ring.keys.has(ring.active)) throw new Error("KEK ativa ausente do chaveiro");
  }

  async generateDataKey(ctx: CofreContext) {
    const plaintext = new Uint8Array(randomBytes(32));
    const blob = seal(plaintext, this.ring.keys.get(this.ring.active)!, cofreAad(ctx), this.ring.active);
    return { plaintext, wrapped: { kekVersion: this.ring.active, blob } };
  }

  async unwrapDataKey(wrapped: WrappedKey, ctx: CofreContext) {
    const kek = this.ring.keys.get(wrapped.kekVersion);
    if (!kek || keyVersionOf(wrapped.blob) !== wrapped.kekVersion) throw new CryptoError();
    return new Uint8Array(open(wrapped.blob, kek, cofreAad(ctx), wrapped.kekVersion));
  }
}

const QUALIFIED_TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;

export function cofreAad(ctx: CofreContext): Buffer {
  // no Cofre a tabela é sempre schema.tabela (ADR 0002); o nome sem schema só existe no vetor antigo do atta-core
  if (!QUALIFIED_TABLE.test(ctx.table)) throw new RangeError("table do Cofre é schema.tabela");
  return Buffer.concat([DOMAIN, columnAad(ctx.tenant_id, ctx.table, ctx.column, ctx.id)]);
}

/** Impressão digital de uma KEK (SHA-256 em hex): serve para recusar a chave de teste do CI em produção. */
export function fingerprint(key: Uint8Array): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Lê e valida o chaveiro. Nenhuma mensagem mostra o valor. */
export function parseKeyring(
  value: string | undefined,
  forbidden: ReadonlySet<string> = new Set(),
  name = "ATTA_SAUDE_CHAVE_MESTRA",
): Keyring {
  if (!value) throw new Error(`${name} ausente`);
  const keys = new Map<number, Uint8Array>();
  let active: number | undefined;
  for (const entry of value.split(",")) {
    const m = ENTRY.exec(entry.trim());
    const version = m ? Number(m[1]) : NaN;
    if (!m || version > MAX_KEY_VERSION || keys.has(version)) throw new Error(`${name} malformada`);
    const key = new Uint8Array(Buffer.from(m[2]!, "hex"));
    if (forbidden.has(fingerprint(key))) throw new Error(`${name} usa chave de teste`);
    keys.set(version, key);
    active ??= version;
  }
  return { active: active!, keys };
}
