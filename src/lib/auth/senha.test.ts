import { describe, expect, it } from "vitest";
import { senhaNova } from "./senha";

describe("política da senha nova", () => {
  it("12 ou mais, com letras e dígitos", () => {
    expect(senhaNova.safeParse("NovaSenha2026").success).toBe(true);
    expect(senhaNova.safeParse("Curta12").success).toBe(false);
    expect(senhaNova.safeParse("SoLetrasSemDigito").success).toBe(false);
    expect(senhaNova.safeParse("123456789012345").success).toBe(false);
  });
});
