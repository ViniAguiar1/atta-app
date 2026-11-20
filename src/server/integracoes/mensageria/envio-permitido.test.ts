import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { okProvedor } from "../comum/resultado-provedor";
import {
  hmacDoDestino,
  ListaDePermitidosInvalida,
  lerListaDePermitidos,
  ProvedorComListaDePermitidos,
} from "./envio-permitido";
import type { ProvedorMensagem } from "./porta";
import type { MensagemRenderizada } from "./tipos";

// pepper e destinos fictícios
const PEPPER_HEX = "cd".repeat(32);
const PEPPER = Buffer.from(PEPPER_HEX, "hex");
const TIME_TEL = "+5511900000001";
const TIME_EMAIL = "time@atta.test";

function provedorFalso(canal: ProvedorMensagem["canal"]) {
  const enviar = vi.fn(async () => okProvedor({ idExterno: "ext-1" }));
  const interpretarRetorno = vi.fn(() => okProvedor([]));
  return {
    canal,
    nome: `falso-${canal}`,
    enviar,
    interpretarRetorno,
  } satisfies ProvedorMensagem;
}

const zap = (para: string): MensagemRenderizada => ({
  canal: "whatsapp",
  para,
  chaveIdempotencia: "k",
  whatsapp: {
    modelo: "atta_link_checkin",
    idioma: "pt_BR",
    categoria: "utility",
    parametros: [],
  },
});
const email = (para: string): MensagemRenderizada => ({
  canal: "email",
  para,
  chaveIdempotencia: "k",
  assunto: "a",
});

describe("HMAC do destino", () => {
  it("telefone: HMAC-SHA256 com rótulo próprio sobre o E.164", () => {
    const esperado = createHmac("sha256", PEPPER).update(`atta.telefone.v1|${TIME_TEL}`).digest("hex");
    expect(hmacDoDestino(PEPPER, "whatsapp", TIME_TEL)).toBe(esperado);
    expect(hmacDoDestino(PEPPER, "sms", TIME_TEL)).toBe(esperado);
  });

  it("e-mail: o mesmo HMAC da busca por e-mail, sobre o valor normalizado", () => {
    const esperado = createHmac("sha256", PEPPER).update(`atta.email.v1|${TIME_EMAIL}`).digest("hex");
    expect(hmacDoDestino(PEPPER, "email", " Time@ATTA.test ")).toBe(esperado);
  });

  it("destino fora da forma não tem HMAC", () => {
    expect(hmacDoDestino(PEPPER, "whatsapp", "11900000001")).toBeNull();
    expect(hmacDoDestino(PEPPER, "email", "sem-arroba")).toBeNull();
  });
});

describe("leitura da lista", () => {
  it("aceita vírgula, espaço e quebra de linha, e normaliza para minúsculas", () => {
    const a = "A".repeat(64);
    const b = "b".repeat(64);
    const { hmacs } = lerListaDePermitidos(PEPPER_HEX, ` ${a},\n${b} `);
    expect([...hmacs]).toEqual(["a".repeat(64), b]);
  });

  it("recusa item que não é HMAC e pepper curto, sem repetir o valor", () => {
    expect(() => lerListaDePermitidos(PEPPER_HEX, "+5511900000001")).toThrow(ListaDePermitidosInvalida);
    try {
      lerListaDePermitidos(PEPPER_HEX, "+5511900000001");
    } catch (e) {
      expect(String(e)).not.toContain("5511900000001");
    }
    expect(() => lerListaDePermitidos("ab".repeat(16), "")).toThrow(ListaDePermitidosInvalida);
  });
});

describe("provedor atrás da lista de permitidos", () => {
  const lista = new Set([hmacDoDestino(PEPPER, "whatsapp", TIME_TEL)!, hmacDoDestino(PEPPER, "email", TIME_EMAIL)!]);

  it("destino do time sai pelo provedor real", async () => {
    const real = provedorFalso("whatsapp");
    const p = new ProvedorComListaDePermitidos(real, PEPPER, lista);
    expect(await p.enviar(zap(TIME_TEL))).toEqual(okProvedor({ idExterno: "ext-1" }));
    expect(real.enviar).toHaveBeenCalledOnce();
    expect(p.nome).toBe("falso-whatsapp");
  });

  it("destino fora da lista vira bloqueado_stage e não chama o provedor", async () => {
    const real = provedorFalso("whatsapp");
    const p = new ProvedorComListaDePermitidos(real, PEPPER, lista);
    const r = await p.enviar(zap("+5511900000002"));
    expect(r).toMatchObject({
      ok: false,
      falha: { tipo: "permanente", codigo: "bloqueado_stage" },
    });
    expect(JSON.stringify(r)).not.toContain("900000002");
    expect(real.enviar).not.toHaveBeenCalled();
  });

  it("e-mail em @exemplo.test nunca sai, nem se estiver na lista", async () => {
    const real = provedorFalso("email");
    const fixo = "paciente@exemplo.test";
    const p = new ProvedorComListaDePermitidos(
      real,
      PEPPER,
      new Set([...lista, hmacDoDestino(PEPPER, "email", fixo)!]),
    );
    expect(await p.enviar(email(TIME_EMAIL))).toMatchObject({ ok: true });
    expect(await p.enviar(email("Paciente@Exemplo.TEST"))).toMatchObject({
      ok: false,
      falha: { codigo: "bloqueado_stage" },
    });
    expect(real.enviar).toHaveBeenCalledOnce();
  });

  it("mensagem de outro canal não passa", async () => {
    const real = provedorFalso("whatsapp");
    const p = new ProvedorComListaDePermitidos(real, PEPPER, lista);
    expect(await p.enviar({ ...email(TIME_EMAIL) })).toMatchObject({
      ok: false,
      falha: { codigo: "bloqueado_stage" },
    });
  });

  it("o webhook passa direto ao provedor", () => {
    const real = provedorFalso("whatsapp");
    const p = new ProvedorComListaDePermitidos(real, PEPPER, lista);
    p.interpretarRetorno({ corpo: "{}", cabecalhos: {} });
    expect(real.interpretarRetorno).toHaveBeenCalledOnce();
  });
});
