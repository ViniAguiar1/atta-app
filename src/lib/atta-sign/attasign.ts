/**
 * `evidence_sha256` e Código ATTA por `atta_sign_version` (ADR 0006 §4, §5 e item 10). Porte de
 * `atta_core.crypto.attasign`; os vetores de `tests/vectors/atta_sign_v1` são a especificação.
 *
 * Versão 1: `evidence_sha256 = SHA-256(JCS(payload))` em hex minúsculo, do payload exatamente como guardado.
 * `extensions.icp_brasil` fica fora do hash (ADR 0006 §8): a versão 1 recusa em vez de remover em silêncio.
 * `extensions.code_nonce` entra no hash (retentativa de colisão do código).
 * Código ATTA: `ATTA-XXXX-XXXX-XXXX`, 12 símbolos Crockford dos 60 bits mais significativos do hash.
 *
 * Sem segredo: pode rodar no servidor e em verificação independente. A montagem do payload é só do servidor.
 */
import { createHash } from "node:crypto";
import { decode, encode } from "./crockford";
import { canonicalize } from "./jcs";

export const CODE_PREFIX = "ATTA";
const CODE_SYMBOLS = 12; // 60 bits
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const MAX_INPUT = 64; // RFC-0020 D-2
const MALFORMED = "Código ATTA malformado";

type Payload = Record<string, unknown>;

function version1(payload: Payload): string {
  const ext = payload.extensions;
  if (ext && typeof ext === "object" && "icp_brasil" in ext) {
    throw new Error("extensions.icp_brasil fica fora do hash do ATTA Sign (ADR 0006 §8): retire antes de calcular");
  }
  assertSafeIntegers(payload);
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

const VERSIONS: Record<string, (p: Payload) => string> = { "1": version1 };
export const ATTA_SIGN_VERSIONS = Object.freeze(Object.keys(VERSIONS));

export function evidenceSha256(payload: Payload): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("o payload do ATTA Sign é um objeto JSON");
  }
  const versao = payload.atta_sign_version;
  const calculo = typeof versao === "string" && Object.hasOwn(VERSIONS, versao) ? VERSIONS[versao] : undefined;
  if (!calculo) {
    throw new Error(`atta_sign_version ausente ou desconhecida; conhecidas: ${ATTA_SIGN_VERSIONS.join(", ")}`);
  }
  return calculo(payload);
}

export function attaCode(evidencia: string): string {
  if (!HEX_SHA256.test(evidencia)) throw new Error("evidence_sha256 precisa de 64 dígitos hexadecimais minúsculos");
  return format(BigInt("0x" + evidencia.slice(0, 15))); // 15 hex = 60 bits mais significativos
}

/** Código como a pessoa digitou → forma canônica, ou erro com mensagem única (não vira oráculo; org/10 C-13). */
export function normalizeAttaCode(entrada: string): string {
  if (typeof entrada !== "string") throw new TypeError("o código digitado é texto");
  if (entrada.length > MAX_INPUT) throw new Error(MALFORMED);
  let limpo = entrada.replace(/\s+/gu, "").replaceAll("-", "");
  if (!/^[\x00-\x7f]*$/.test(limpo)) throw new Error(MALFORMED);
  limpo = limpo.toUpperCase();
  if (limpo.length === CODE_PREFIX.length + CODE_SYMBOLS && limpo.startsWith(CODE_PREFIX)) {
    limpo = limpo.slice(CODE_PREFIX.length);
  }
  try {
    return format(decode(limpo, CODE_SYMBOLS));
  } catch {
    throw new Error(MALFORMED);
  }
}

function format(valor: bigint): string {
  const s = encode(valor, CODE_SYMBOLS);
  return `${CODE_PREFIX}-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** O esquema v1 só tem inteiros (RFC-0017 D-4): número fracionário ou fora de ±2^53 é recusado. */
function assertSafeIntegers(valor: unknown): void {
  if (typeof valor === "number") {
    if (!Number.isInteger(valor) || Math.abs(valor) > 2 ** 53) {
      throw new RangeError("o payload v1 só aceita inteiros até ±2^53 (RFC-0017 D-4)");
    }
  } else if (Array.isArray(valor)) {
    valor.forEach(assertSafeIntegers);
  } else if (valor && typeof valor === "object") {
    Object.values(valor).forEach(assertSafeIntegers);
  }
}
