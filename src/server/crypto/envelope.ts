/**
 * Formato 1 do valor cifrado (ADR 0002 §2; porte de `atta_core.crypto.envelope`, vetores em tests/vectors/crypto_v1).
 * Valor: `0x01 ‖ key_version uint16 BE ‖ nonce 12 ‖ cifrado ‖ tag 16`; o cabeçalho de 3 bytes entra na AAD do GCM.
 * AAD de coluna: `tenant_id|table|column|id` (tenant vazio para dado de rede).
 * Toda falha de decifra é `CryptoError` (`CRYPTO_FAILED`), sem dizer se foi tag, AAD, versão ou formato.
 */
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const MAX_KEY_VERSION = 0x7fff; // key_version SMALLINT
const FORMAT = 1;
const HEADER = 3;
const NONCE = 12;
const TAG = 16;
const MIN_VALUE = HEADER + NONCE + TAG;
// `health.answer` ou `person`: identificador, opcionalmente qualificado pelo schema; nunca o separador `|`
const TABLE = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;
const COLUMN = /^[a-z_][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class CryptoError extends Error {
  readonly code = "CRYPTO_FAILED";
  constructor() {
    super("falha ao decifrar");
  }
}

/** Cifra `plaintext` com a DEK (32 bytes); nonce novo a cada chamada. */
export function seal(plaintext: Uint8Array, key: Uint8Array, aad: Uint8Array, keyVersion = 1): Buffer {
  checkKey(key);
  checkVersion(keyVersion);
  const header = Buffer.from([FORMAT, keyVersion >> 8, keyVersion & 0xff]);
  const nonce = randomBytes(NONCE);
  const c = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG });
  c.setAAD(Buffer.concat([header, aad]));
  const body = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([header, nonce, body, c.getAuthTag()]);
}

/** Decifra; `keyVersion` precisa ser a do cabeçalho. Qualquer falha → CryptoError. */
export function open(value: Uint8Array, key: Uint8Array, aad: Uint8Array, keyVersion = 1): Buffer {
  checkKey(key);
  const v = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (keyVersionOf(v) !== keyVersion) throw new CryptoError();
  try {
    const d = createDecipheriv("aes-256-gcm", key, v.subarray(HEADER, HEADER + NONCE), { authTagLength: TAG });
    d.setAAD(Buffer.concat([v.subarray(0, HEADER), aad]));
    d.setAuthTag(v.subarray(v.length - TAG));
    return Buffer.concat([d.update(v.subarray(HEADER + NONCE, v.length - TAG)), d.final()]);
  } catch {
    throw new CryptoError();
  }
}

export function keyVersionOf(value: Uint8Array): number {
  if (value.length < MIN_VALUE) throw new CryptoError();
  const version = (value[1]! << 8) | value[2]!;
  if (value[0] !== FORMAT || version < 1 || version > MAX_KEY_VERSION) throw new CryptoError();
  return version;
}

export function columnAad(tenantId: string, table: string, column: string, id: string): Buffer {
  if (!TABLE.test(table) || !COLUMN.test(column)) throw new RangeError("table e column da AAD são identificadores");
  if (tenantId !== "" && !UUID.test(tenantId)) throw new TypeError("tenant_id é UUID minúsculo ou vazio");
  if (!UUID.test(id)) throw new TypeError("id é UUID minúsculo");
  return Buffer.from([tenantId, table, column, id].join("|"), "ascii");
}

/**
 * AAD do contêiner `dek_wrapped` do atta-core: `atta_core.crypto.data_key|tenant_id`. Só para ler o vetor e dado
 * antigo; o Cofre desta stack amarra a DEK ao contexto inteiro (`cofreAad` em src/server/cofre).
 */
export function legacyDataKeyAad(tenantId: string): Buffer {
  if (tenantId !== "" && !UUID.test(tenantId)) throw new TypeError("tenant_id é UUID minúsculo ou vazio");
  return Buffer.from(`atta_core.crypto.data_key|${tenantId}`, "ascii");
}

function checkKey(key: Uint8Array): void {
  if (key.length !== 32) throw new RangeError("chave AES-256 precisa de 32 bytes");
}

function checkVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1 || version > MAX_KEY_VERSION) {
    throw new RangeError(`key_version fora de 1..${MAX_KEY_VERSION}`);
  }
}
