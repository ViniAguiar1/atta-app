import { describe, expect, it } from "vitest";
import { linkValido } from "./link";

describe("link do e-mail", () => {
  it("aceita só recovery e invite, com token no formato do Auth", () => {
    expect(linkValido("abc123_-XYZ", "recovery")).toBe(true);
    expect(linkValido("abc123_-XYZ", "invite")).toBe(true);
    expect(linkValido("abc123_-XYZ", "signup")).toBe(false);
    expect(linkValido("curto", "recovery")).toBe(false);
    expect(linkValido("tem espaço aqui", "recovery")).toBe(false);
    expect(linkValido(undefined, "recovery")).toBe(false);
  });
});
