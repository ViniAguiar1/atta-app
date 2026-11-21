import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CI_TEST_PIN_PEPPER_HEX } from "../../../tests/fixtures/cofre-ci";
import { PIN_MAC_VERSION, pinMacWith, validarPin } from "./pin";

const pepper = Buffer.from(CI_TEST_PIN_PEPPER_HEX, "hex");
const PROF = "00000000-0000-4000-8000-0000000000f1";

describe("PIN do Boarding Check (criação no PROpass)", () => {
  it("recusa os 10 PINs de dígitos iguais", () => {
    for (let n = 0; n <= 9; n++) expect(validarPin(String(n).repeat(4))).toEqual({ ok: false, motivo: "obvio" });
  });

  it("recusa as sequências crescentes 0123 a 6789 e as decrescentes 9876 a 3210", () => {
    for (let i = 0; i <= 6; i++) {
      const subida = [0, 1, 2, 3].map((k) => i + k).join("");
      const descida = [0, 1, 2, 3].map((k) => 9 - i - k).join("");
      expect(validarPin(subida), subida).toEqual({ ok: false, motivo: "obvio" });
      expect(validarPin(descida), descida).toEqual({ ok: false, motivo: "obvio" });
    }
  });

  it("aceita PIN de 4 números que não é óbvio (a regra não inventa casos além da decisão do CTO)", () => {
    for (const pin of ["4071", "1357", "8890", "7890", "0987", "1212", "2580"]) expect(validarPin(pin), pin).toEqual({ ok: true });
  });

  it("recusa o que não é exatamente 4 números", () => {
    for (const pin of ["", "123", "12345", "12a4", " 1234", "１２３４"]) {
      expect(validarPin(pin), pin).toEqual({ ok: false, motivo: "formato" });
    }
  });

  it("pin_mac = HMAC-SHA256(pepper, 'atta.pin.v1|' + professional_id + '|' + pin), 32 bytes", () => {
    const esperado = createHmac("sha256", pepper).update(`atta.pin.v1|${PROF}|4071`, "utf8").digest();
    const mac = pinMacWith(pepper, PROF, "4071");
    expect(mac).toHaveLength(32);
    expect(mac.equals(esperado)).toBe(true);
    expect(PIN_MAC_VERSION).toBe(1);
  });

  it("o mesmo PIN de outro profissional dá outro mac, e outro PIN do mesmo profissional também", () => {
    const outro = "00000000-0000-4000-8000-0000000000f2";
    expect(pinMacWith(pepper, PROF, "4071").equals(pinMacWith(pepper, outro, "4071"))).toBe(false);
    expect(pinMacWith(pepper, PROF, "4071").equals(pinMacWith(pepper, PROF, "4072"))).toBe(false);
  });

  it("recusa pepper curto, id que não é uuid e PIN fora do formato (sem calcular nada)", () => {
    expect(() => pinMacWith(Buffer.alloc(31), PROF, "4071")).toThrow(RangeError);
    expect(() => pinMacWith(pepper, "nao-e-uuid", "4071")).toThrow(RangeError);
    expect(() => pinMacWith(pepper, PROF, "40712")).toThrow(RangeError);
  });
});
