import { describe, expect, it } from "vitest";
import { SimuladorMensageria } from "./simulador";
import type { MensagemRenderizada } from "./tipos";

// Números fictícios; o final escolhe o cenário do simulador.
const codigo = (para: string, chave = `k-${para}`): MensagemRenderizada => ({
  canal: "whatsapp",
  para,
  chaveIdempotencia: chave,
  whatsapp: {
    modelo: "atta_codigo_verificacao",
    idioma: "pt_BR",
    categoria: "authentication",
    parametros: ["482913"],
    codigoNoBotao: "482913",
  },
});

describe("simulador de mensageria", () => {
  it("entrega, guarda na caixa de saída e é idempotente pela chave", async () => {
    const sim = new SimuladorMensageria("whatsapp");
    const a = await sim.enviar(codigo("+5511912340001"));
    const b = await sim.enviar(codigo("+5511912340001"));
    expect(a).toEqual(b);
    expect(sim.caixaDeSaida).toHaveLength(1);
    expect(sim.ultimoCodigoPara("+5511912340001")).toBe("482913");
    expect(sim.retornosPendentes()).toEqual([expect.objectContaining({ estado: "entregue", cobravel: true })]);
  });

  it("cenários de falha pelo final do número", async () => {
    const sim = new SimuladorMensageria("whatsapp");
    const permanente = await sim.enviar(codigo("+5511912340000"));
    const transitoria = await sim.enviar(codigo("+5511912349999"));
    expect(!permanente.ok && permanente.falha.tipo).toBe("permanente");
    expect(!transitoria.ok && transitoria.falha.tipo).toBe("transitoria");
    await sim.enviar(codigo("+5511912348888"));
    expect(sim.retornosPendentes()).toEqual([expect.objectContaining({ estado: "falhou", cobravel: false })]);
  });

  it("e-mail nunca é cobrável", async () => {
    const sim = new SimuladorMensageria("email");
    await sim.enviar({
      canal: "email",
      para: "gestor@clinica-ficticia.test",
      chaveIdempotencia: "e1",
      assunto: "A",
      texto: "B",
    });
    expect(sim.retornosPendentes()[0]).toMatchObject({ estado: "entregue", cobravel: false });
  });

  it("lê o webhook simulado e recusa corpo inválido", () => {
    const sim = new SimuladorMensageria("sms");
    const r = sim.interpretarRetorno({
      corpo: JSON.stringify({
        retornos: [{ canal: "sms", idExterno: "x", estado: "entregue", quando: "2026-11-20T15:00:00Z" }],
      }),
      cabecalhos: {},
    });
    expect(r.ok && r.valor[0]?.quando.toISOString()).toBe("2026-11-20T15:00:00.000Z");
    expect(sim.interpretarRetorno({ corpo: "{", cabecalhos: {} }).ok).toBe(false);
  });
});
