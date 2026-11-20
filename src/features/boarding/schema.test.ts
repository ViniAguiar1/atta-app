import { describe, expect, it } from "vitest";
import { minutosAte, pinSchema } from "./schema";

describe("pinSchema", () => {
  it("aceita só 4 dígitos", () => {
    expect(pinSchema.safeParse({ pin: "2468" }).success).toBe(true);
    for (const pin of ["246", "24680", "24a8", " 2468", ""]) expect(pinSchema.safeParse({ pin }).success).toBe(false);
  });
});

describe("minutosAte", () => {
  const agora = Date.parse("2026-11-20T13:00:00Z");
  it("arredonda para cima e nunca dá menos de 1", () => {
    expect(minutosAte("2026-11-20T13:15:00Z", agora)).toBe(15);
    expect(minutosAte("2026-11-20T13:14:01Z", agora)).toBe(15);
    expect(minutosAte("2026-11-20T13:00:10Z", agora)).toBe(1);
    expect(minutosAte("2026-11-20T12:59:00Z", agora)).toBe(1);
  });
});
