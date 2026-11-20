/**
 * Crockford Base32, o alfabeto do Código ATTA (ADR 0006 §5). Porte de `atta_core.crypto.crockford`.
 * Sem I, L, O e U; na leitura `O` vale 0, `I` e `L` valem 1 e minúscula ASCII vale maiúscula. Só ASCII.
 * Sem símbolo de verificação (RFC-0020 D-1, errata do ADR 0006 §5).
 */

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const VALUES = new Map<string, number>();
[...ALPHABET].forEach((simbolo, valor) => VALUES.set(simbolo, valor));
VALUES.set("O", 0).set("I", 1).set("L", 1);
for (const [simbolo, valor] of [...VALUES]) VALUES.set(simbolo.toLowerCase(), valor);

export function encode(valor: bigint, simbolos: number): string {
  if (simbolos < 1 || valor < 0n || valor >= 1n << BigInt(5 * simbolos)) {
    throw new RangeError(`o valor não cabe em ${simbolos} símbolos de 5 bits`);
  }
  let saida = "";
  for (let posicao = simbolos - 1; posicao >= 0; posicao--) {
    saida += ALPHABET[Number((valor >> BigInt(5 * posicao)) & 31n)];
  }
  return saida;
}

export function decode(texto: string, simbolos: number): bigint {
  if (texto.length !== simbolos) throw new RangeError("texto com tamanho diferente do esperado para o código");
  let valor = 0n;
  for (const simbolo of texto) {
    const v = VALUES.get(simbolo);
    if (v === undefined) throw new RangeError("símbolo fora do alfabeto Crockford");
    valor = (valor << 5n) | BigInt(v);
  }
  return valor;
}
