import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("logger", () => {
  it("escreve uma linha JSON com nível, evento e contexto", () => {
    const saida = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("saude.consultada", { rota: "/api/health", ms: 3 });
    expect(saida).toHaveBeenCalledOnce();
    expect(JSON.parse(String(saida.mock.calls[0]?.[0]))).toMatchObject({ nivel: "info", evento: "saude.consultada", ms: 3 });
  });

  it("erro vai para console.error", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("falha.inesperada", { code: "INTERNO" });
    expect(erro).toHaveBeenCalledOnce();
  });
});
