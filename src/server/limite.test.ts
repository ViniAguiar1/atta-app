// Limitador de tentativas (ADR 0004 §2). Pepper e IPs fictícios; o banco é trocado por um cliente falso.
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { chaveDoLimite, chaveDoLimiteWith, type ClienteDoLimite, consumirLimite, LIMITES } from "./limite";

const PEPPER = Buffer.alloc(32, 7);

beforeAll(() => {
  process.env.ATTA_CPF_PEPPER = "07".repeat(32);
});

type Chamada = { fn: string; args: Record<string, unknown> };

function clienteFalso(resposta: { data: boolean | null; error: { code?: string; message?: string } | null }) {
  const chamadas: Chamada[] = [];
  const cliente: ClienteDoLimite = {
    schema: () => ({
      rpc: (fn, args) => {
        chamadas.push({ fn, args });
        return Promise.resolve(resposta);
      },
    }),
  };
  return { cliente, chamadas };
}

describe("chave do limite", () => {
  it("é o HMAC-SHA256 com o rótulo de domínio, nunca o valor cru", () => {
    const esperado = createHmac("sha256", PEPPER).update("atta.ratelimit.v1|verify.ip|203.0.113.7", "utf8").digest();
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.7").equals(esperado)).toBe(true);
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.7")).toHaveLength(32);
  });

  it("separa bucket e valor, e o espaço nas pontas não cria outra chave", () => {
    const a = chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.7");
    expect(chaveDoLimiteWith(PEPPER, "checkin.start.ip", "203.0.113.7").equals(a)).toBe(false);
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.8").equals(a)).toBe(false);
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", " 203.0.113.7 ").equals(a)).toBe(true);
  });

  it("sem valor, todos dividem um contador só", () => {
    const semValor = chaveDoLimiteWith(PEPPER, "verify.ip", null);
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", "").equals(semValor)).toBe(true);
    expect(chaveDoLimiteWith(PEPPER, "verify.ip", undefined).equals(semValor)).toBe(true);
  });

  it("recusa bucket fora do formato e pepper curto", () => {
    expect(() => chaveDoLimiteWith(PEPPER, "Verify IP", "x")).toThrow(RangeError);
    expect(() => chaveDoLimiteWith(Buffer.alloc(16), "verify.ip", "x")).toThrow(RangeError);
  });

  it("usa o ATTA_CPF_PEPPER do ambiente", () => {
    expect(chaveDoLimite("verify.ip", "203.0.113.7").equals(chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.7")))
      .toBe(true);
  });
});

describe("consumirLimite", () => {
  it("dentro do limite: ok, e manda ao banco só o HMAC em hex", async () => {
    const { cliente, chamadas } = clienteFalso({ data: true, error: null });
    const r = await consumirLimite(LIMITES.verificacaoPublicaPorIp, "203.0.113.7", cliente);
    expect(r).toEqual({ ok: true, data: null });
    expect(chamadas).toHaveLength(1);
    const args = chamadas[0]!.args;
    expect(chamadas[0]!.fn).toBe("rate_limit_hit");
    expect(args).toMatchObject({ p_bucket: "verify.ip", p_limit: 30, p_window_seconds: 60 });
    expect(args.p_key_hash).toBe(`\\x${chaveDoLimiteWith(PEPPER, "verify.ip", "203.0.113.7").toString("hex")}`);
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
  });

  it("passou do limite: LIMITE", async () => {
    const { cliente } = clienteFalso({ data: false, error: null });
    const r = await consumirLimite(LIMITES.checkinIniciarPorIp, "198.51.100.1", cliente);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LIMITE");
  });

  it("erro do banco nega (falha fechada), sem repetir a mensagem crua", async () => {
    const { cliente } = clienteFalso({ data: null, error: { code: "08006", message: "connection failure 10.0.0.1" } });
    const r = await consumirLimite(LIMITES.verificacaoPublicaPorIp, "203.0.113.7", cliente);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INDISPONIVEL");
      expect(r.error.message).not.toContain("10.0.0.1");
    }
  });

  it("resposta inesperada do banco também nega", async () => {
    const { cliente } = clienteFalso({ data: null, error: null });
    const r = await consumirLimite(LIMITES.verificacaoPublicaPorIp, "203.0.113.7", cliente);
    expect(r.ok).toBe(false);
  });

  it("as políticas seguem a ADR: 30/min na verificação, 10 e 100 por 10 min no check-in", () => {
    expect(LIMITES.verificacaoPublicaPorIp).toEqual({ bucket: "verify.ip", limite: 30, janelaSegundos: 60 });
    expect(LIMITES.checkinIniciarPorIp).toEqual({ bucket: "checkin.start.ip", limite: 10, janelaSegundos: 600 });
    expect(LIMITES.checkinIniciarPorPortal).toEqual({ bucket: "checkin.start.portal", limite: 100, janelaSegundos: 600 });
  });
});
