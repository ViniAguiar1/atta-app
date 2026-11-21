import { describe, expect, it } from "vitest";
import { HREF, SUBABAS_ATTA } from "./subabas";

describe("subabas do ATTA", () => {
  it("são as 5 do simulador, na ordem dele, e a Central de Ajuda é a primeira", () => {
    expect(SUBABAS_ATTA.map((s) => s.rotulo)).toEqual([
      "Central de Ajuda",
      "Suporte & Chamados",
      "Privacidade & Dados (LGPD)",
      "Co-criação",
      "Soluções ATTA",
    ]);
    expect(SUBABAS_ATTA[0]!.href).toBe(HREF.ajuda);
    expect(new Set(SUBABAS_ATTA.map((s) => s.href)).size).toBe(5);
  });
});
