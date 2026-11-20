// Verificação pública do Código ATTA (MIG-24). Banco trocado por cliente falso; IPs e códigos fictícios.
import { beforeAll, describe, expect, it } from "vitest";
import { type ClienteDaVerificacao, NAO_ENCONTRADO, verificarCodigo } from "./verificar";

beforeAll(() => {
  process.env.ATTA_CPF_PEPPER = "07".repeat(32);
});

const ENCONTRADO = {
  exists: true,
  tenant_trade_name: "Clinica Ficticia",
  document_type: "tcle",
  template_version: 1,
  signed_at: "2026-11-20T14:05:09.412Z",
  status: "pre_assinado",
  evidence_sha256: "a".repeat(64),
  level: "atta_sign",
};

type Chamada = { fn: string; args: Record<string, unknown> };

function cliente(opcoes: { limite?: boolean; teto?: boolean; linha?: unknown; erro?: { code: string; message: string } } = {}) {
  const chamadas: Chamada[] = [];
  const c = {
    schema: () => ({
      rpc: (fn: string, args: Record<string, unknown>) => {
        chamadas.push({ fn, args });
        if (fn === "rate_limit_hit") {
          const ok = args.p_bucket === "verify.global" ? (opcoes.teto ?? true) : (opcoes.limite ?? true);
          return Promise.resolve({ data: ok, error: null });
        }
        if (opcoes.erro) return Promise.resolve({ data: null, error: opcoes.erro });
        return Promise.resolve({ data: [opcoes.linha ?? NAO_ENCONTRADO], error: null });
      },
    }),
  } as unknown as ClienteDaVerificacao;
  return { c, chamadas };
}

const comIp = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

describe("verificarCodigo", () => {
  it("normaliza o que a pessoa digitou e devolve as 8 chaves", async () => {
    const { c, chamadas } = cliente({ linha: ENCONTRADO });
    const r = await verificarCodigo(" atta 7k3m 9qpx 2b4d ", comIp, c);
    expect(r).toEqual({ ok: true, data: ENCONTRADO });
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit", "rate_limit_hit", "atta_code_verify"]);
    expect(chamadas[2]!.args).toEqual({ p_code: "ATTA-7K3M-9QPX-2B4D" });
  });

  it("o limite é contado primeiro, com o IP do x-forwarded-for, e o IP não vai ao banco em claro", async () => {
    const { c, chamadas } = cliente({ linha: ENCONTRADO });
    await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, c);
    expect(chamadas[0]).toMatchObject({ fn: "rate_limit_hit", args: { p_bucket: "verify.ip", p_limit: 30, p_window_seconds: 60 } });
    expect(chamadas[1]).toMatchObject({ fn: "rate_limit_hit", args: { p_bucket: "verify.global", p_limit: 600, p_window_seconds: 60 } });
    expect(JSON.stringify(chamadas)).not.toContain("203.0.113.7");
  });

  it("passou do limite: LIMITE, sem consultar o código", async () => {
    const { c, chamadas } = cliente({ limite: false });
    const r = await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("LIMITE");
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit"]);
  });

  it("teto da rota inteira (600/min) passou: INDISPONIVEL, sem consultar o código", async () => {
    const { c, chamadas } = cliente({ teto: false });
    const r = await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("INDISPONIVEL");
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit", "rate_limit_hit"]);
  });

  it("malformado responde igual ao inexistente, e também conta no limite", async () => {
    const inexistente = await verificarCodigo("ATTA-0000-0000-0000", comIp, cliente().c);
    const { c, chamadas } = cliente();
    const malformado = await verificarCodigo("<script>alert(1)</script>", comIp, c);
    expect(malformado).toEqual(inexistente);
    expect(malformado).toEqual({ ok: true, data: NAO_ENCONTRADO });
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit", "rate_limit_hit"]);
    expect((await verificarCodigo("x".repeat(500), comIp, cliente().c))).toEqual(inexistente);
  });

  it("erro do banco vira INDISPONIVEL sem repetir a mensagem crua", async () => {
    const { c } = cliente({ erro: { code: "08006", message: "connection failure 10.0.0.1" } });
    const r = await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, c);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("INDISPONIVEL");
      expect(JSON.stringify(r)).not.toContain("10.0.0.1");
    }
  });

  it("resposta do banco fora do contrato é erro interno, nunca 'não encontrado' nem chave a mais", async () => {
    const r1 = await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, cliente({ linha: { ...ENCONTRADO, cpf: "x" } }).c);
    const r2 = await verificarCodigo("ATTA-7K3M-9QPX-2B4D", comIp, cliente({ linha: { ...ENCONTRADO, status: "outro" } }).c);
    for (const r of [r1, r2]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("INTERNO");
    }
  });
});
