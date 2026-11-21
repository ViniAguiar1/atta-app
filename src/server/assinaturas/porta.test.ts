import { describe, expect, it } from "vitest";
import { escolherPortaAssinaturas } from "./porta";

describe("escolherPortaAssinaturas", () => {
  it("na produção é a vazia: nada para ler e a escrita dá INDISPONIVEL", async () => {
    const porta = escolherPortaAssinaturas("production");
    expect(await porta.ler()).toEqual({ ok: true, data: null });
    const r = await porta.salvarModelo("rt_apenas");
    expect(!r.ok && r.error.code).toBe("INDISPONIVEL");
  });

  it("fora da produção é a simulada: devolve o modelo salvo e não guarda entre chamadas", async () => {
    const porta = escolherPortaAssinaturas("preview");
    const r = await porta.salvarModelo("profissional_apenas");
    expect(r.ok && r.data.modelo).toBe("profissional_apenas");
    const depois = await porta.ler();
    expect(depois.ok && depois.data?.modelo).toBe("rt_profissional");
    expect(depois.ok && depois.data?.chancela.rt).not.toHaveProperty("cpf");
  });
});
