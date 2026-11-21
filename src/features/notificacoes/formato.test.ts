import { describe, expect, it } from "vitest";
import { grupoDoDia, rotuloDoQuando } from "./formato";

const FUSO = "America/Sao_Paulo";
// 21/11/2026 às 10:00 em São Paulo (13:00 UTC)
const AGORA = new Date("2026-11-21T13:00:00Z");

describe("quando da notificação, no fuso da clínica (captura 41)", () => {
  it("hoje: agora, minutos e horas", () => {
    expect(rotuloDoQuando("2026-11-21T12:59:40Z", AGORA, FUSO)).toBe("agora");
    expect(rotuloDoQuando("2026-11-21T12:55:00Z", AGORA, FUSO)).toBe("há 5 min");
    expect(rotuloDoQuando("2026-11-21T03:30:00Z", AGORA, FUSO)).toBe("há 9 h"); // 00:30 em São Paulo, ainda hoje
    expect(grupoDoDia("2026-11-21T03:30:00Z", AGORA, FUSO)).toBe("hoje");
  });

  it("ontem e antes, pelo dia de São Paulo e não pelo de UTC", () => {
    // 20/11 às 23:30 em São Paulo é 21/11 às 02:30 em UTC: ainda é ontem na clínica
    expect(grupoDoDia("2026-11-21T02:30:00Z", AGORA, FUSO)).toBe("ontem");
    expect(rotuloDoQuando("2026-11-21T02:30:00Z", AGORA, FUSO)).toBe("ontem às 23:30");
    expect(grupoDoDia("2026-11-18T12:05:00Z", AGORA, FUSO)).toBe("anteriores");
    expect(rotuloDoQuando("2026-11-18T12:05:00Z", AGORA, FUSO)).toBe("18/11 às 09:05");
  });
});
