// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { mascararCelular } = await import("./real");

describe("porta real de Configurações", () => {
  it("a máscara do celular mostra só o DDD e os 4 últimos, com o ponto médio (ADR 0002 §6)", () => {
    expect(mascararCelular("48999990001")).toBe("(48) ·····-0001");
    expect(mascararCelular("48999990001")).not.toContain("99999");
  });
});
