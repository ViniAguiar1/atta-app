// Pepper de HMAC de documento, um por documento (ATTA_CPF_PEPPER, ATTA_RNE_PEPPER): hex, ≥ 32 bytes, só servidor.
import "server-only";

const peppers = new Map<string, Buffer>();

export function pepperFromEnv(name: string): Buffer {
  let pepper = peppers.get(name);
  if (!pepper) {
    const hex = process.env[name];
    if (!hex || !/^([0-9a-f]{2}){32,}$/.test(hex)) throw new Error(`${name} ausente ou malformado`);
    pepper = Buffer.from(hex, "hex");
    peppers.set(name, pepper);
  }
  return pepper;
}
