import "server-only";
import { createHmac } from "node:crypto";
import { pepperFromEnv } from "@/server/crypto/pepper";

// PIN do Boarding Check (decisão do dono, 20/11; ADR 0004 §3, fechada pela Security Engineer): o profissional cria uma
// senha de 4 números no PROpass e usa a mesma em todo Boarding Check. O banco nunca vê o PIN: guarda só o
// pin_mac = HMAC-SHA256(ATTA_PIN_PEPPER, 'atta.pin.v1|' || professional_id || '|' || pin), calculado aqui. O espaço é de
// 10 mil combinações, então o que protege é o pepper fora do banco e os limites de tentativa do Boarding Check
// (Backend 3). A versão do pin_mac acompanha a troca do pepper (trocar o pepper invalida os PINs; o profissional
// redefine pelo e-mail). Criação: Backend 4 (PROpass); conferência: Backend 3 (api.boarding_confirm_pin). Os dois usam
// este módulo, para o HMAC ser um só.

export const PIN_MAC_VERSION = 1;
const ROTULO = "atta.pin.v1|";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORMATO = /^[0-9]{4}$/;

export type ValidacaoDoPin = { ok: true } | { ok: false; motivo: "formato" | "obvio" };

/**
 * PIN óbvio (decisão do CTO, R12; PDD omisso): quatro dígitos iguais (0000 a 9999) e sequências de 4, crescentes
 * (0123 a 6789) ou decrescentes (9876 a 3210). A tela repete a regra (Frontend 6), mas quem decide é o servidor, antes
 * do HMAC, porque o banco não vê o PIN. A mensagem da tela é do i18n, não daqui.
 */
export function validarPin(pin: string): ValidacaoDoPin {
  if (typeof pin !== "string" || !FORMATO.test(pin)) return { ok: false, motivo: "formato" };
  const d = [...pin].map(Number) as [number, number, number, number];
  const repetido = d.every((x) => x === d[0]);
  const crescente = d.every((x, i) => i === 0 || x === d[i - 1]! + 1);
  const decrescente = d.every((x, i) => i === 0 || x === d[i - 1]! - 1);
  return repetido || crescente || decrescente ? { ok: false, motivo: "obvio" } : { ok: true };
}

/** pin_mac com pepper explícito (testes e rotação). Recusa PIN fora do formato e id que não é uuid. */
export function pinMacWith(pepper: Uint8Array, professionalId: string, pin: string): Buffer {
  if (pepper.length < 32) throw new RangeError("pepper precisa de pelo menos 32 bytes");
  if (!UUID.test(professionalId)) throw new RangeError("professional_id fora do formato");
  if (!FORMATO.test(pin)) throw new RangeError("PIN fora do formato");
  return createHmac("sha256", pepper).update(`${ROTULO}${professionalId}|${pin}`, "utf8").digest();
}

/** pin_mac com o ATTA_PIN_PEPPER da Vercel (variável sensível; o de teste é recusado na nuvem). */
export function pinMac(professionalId: string, pin: string): Buffer {
  return pinMacWith(pepperFromEnv("ATTA_PIN_PEPPER"), professionalId, pin);
}
