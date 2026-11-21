// Verificação pública do Código ATTA (MIG-24). Banco trocado por cliente falso; IPs e códigos fictícios.
import { createHash, generateKeyPairSync } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { attaCode } from "@/lib/atta-sign/attasign";
import { signEvidence } from "@/server/atta-sign/seal";
import { type ClienteDaVerificacao, conferirIntegridade, type MaterialDaIntegridade, NAO_ENCONTRADO, verificarCodigo } from "./verificar";

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
  tenant_cnpj: "00.000.000/0001-91",
};

// material fictício com chave Ed25519 gerada aqui: o selo assina o sha256 dos bytes do payload
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PEM = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const PAYLOAD = Buffer.from('{"atta_sign_version":"1","signature":{"signed_at":"2026-11-20T14:05:09.412Z"}}', "utf8");
const SHA = createHash("sha256").update(PAYLOAD).digest("hex");
const CHAVE = {
  kid: "staging-seal-teste", alg: "Ed25519" as const,
  public_key_spki_b64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  valid_from: "2026-11-01T00:00:00.000Z", valid_until: null,
};
const MATERIAL: MaterialDaIntegridade = {
  payload_canonical_b64: PAYLOAD.toString("base64"),
  evidence_sha256: SHA,
  signed_at: "2026-11-20T14:05:09.412Z",
  seals: [{ kid: CHAVE.kid, sig_b64: signEvidence(SHA, CHAVE.kid, PEM).sig_b64 }],
  seal_keys: [CHAVE],
};
// o código que nasce do hash do payload fictício (o que a pessoa consulta)
const CODIGO = attaCode(SHA);

type Chamada = { fn: string; args: Record<string, unknown> };

function cliente(opcoes: { limite?: boolean; teto?: boolean; linha?: unknown; material?: unknown; erro?: { code: string; message: string } } = {}) {
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
        if (fn === "atta_code_material") return Promise.resolve({ data: [opcoes.material ?? MATERIAL], error: null });
        const { integrity: _sem, ...linhaDoBanco } = (opcoes.linha ?? NAO_ENCONTRADO) as Record<string, unknown>;
        return Promise.resolve({ data: [linhaDoBanco], error: null });
      },
    }),
  } as unknown as ClienteDaVerificacao;
  return { c, chamadas };
}

const comIp = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });

describe("verificarCodigo", () => {
  it("normaliza o que a pessoa digitou e devolve as 10 chaves, com a integridade conferida", async () => {
    const { c, chamadas } = cliente({ linha: ENCONTRADO });
    const r = await verificarCodigo(` ${CODIGO.toLowerCase().replaceAll("-", " ")} `, comIp, c);
    expect(r).toEqual({ ok: true, data: { ...ENCONTRADO, integrity: "confere" } });
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit", "rate_limit_hit", "atta_code_verify", "atta_code_material"]);
    expect(chamadas[2]!.args).toEqual({ p_code: CODIGO });
    expect(r.ok && Object.keys(r.data).sort()).toEqual([
      "document_type", "evidence_sha256", "exists", "integrity", "level", "signed_at", "status", "template_version",
      "tenant_cnpj", "tenant_trade_name",
    ]);
    expect(JSON.stringify(r)).not.toContain(MATERIAL.payload_canonical_b64); // o payload nunca sai na resposta
  });

  it("não encontrado não busca o material da integridade", async () => {
    const { c, chamadas } = cliente();
    expect(await verificarCodigo("ATTA-0000-0000-0000", comIp, c)).toEqual({ ok: true, data: NAO_ENCONTRADO });
    expect(chamadas.map((x) => x.fn)).not.toContain("atta_code_material");
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
describe("conferirIntegridade (ADR 0007 §1)", () => {
  it("hash recalculado igual e selo válido: confere", () => {
    expect(conferirIntegridade(MATERIAL, CODIGO)).toBe("confere");
  });
  it("sem selo gravado: null", () => {
    expect(conferirIntegridade({ ...MATERIAL, seals: [] }, CODIGO)).toBeNull();
  });
  it("payload adulterado (hash recalculado diferente do guardado): não confere", () => {
    const outro = Buffer.from('{"atta_sign_version":"1","adulterado":true}', "utf8").toString("base64");
    expect(conferirIntegridade({ ...MATERIAL, payload_canonical_b64: outro }, CODIGO)).toBe("nao_confere");
  });
  it("assinatura trocada, kid fora do manifesto ou chave fora da janela: não confere", () => {
    const sig = Buffer.from(MATERIAL.seals[0]!.sig_b64, "base64");
    sig[0]! ^= 1;
    expect(conferirIntegridade({ ...MATERIAL, seals: [{ kid: CHAVE.kid, sig_b64: sig.toString("base64") }] }, CODIGO)).toBe("nao_confere");
    expect(conferirIntegridade({ ...MATERIAL, seal_keys: [] }, CODIGO)).toBe("nao_confere");
    expect(conferirIntegridade({ ...MATERIAL, seal_keys: [{ ...CHAVE, valid_from: "2026-12-01T00:00:00.000Z" }] }, CODIGO)).toBe("nao_confere");
  });
  it("basta um selo válido entre vários", () => {
    const ruim = { kid: "staging-seal-velha", sig_b64: Buffer.alloc(64).toString("base64") };
    expect(conferirIntegridade({ ...MATERIAL, seals: [ruim, ...MATERIAL.seals] }, CODIGO)).toBe("confere");
  });
  it("código consultado que não nasce do hash dos bytes: não confere", () => {
    const outro = CODIGO.startsWith("ATTA-0") ? CODIGO.replace("ATTA-0", "ATTA-1") : CODIGO.replace(/^ATTA-./, "ATTA-0");
    expect(conferirIntegridade(MATERIAL, outro)).toBe("nao_confere");
  });
  it("o instante do selo vem dos bytes: signed_at do payload ausente ou diferente da coluna não confere", () => {
    expect(conferirIntegridade({ ...MATERIAL, signed_at: "2026-11-20T14:05:10.412Z" }, CODIGO)).toBe("nao_confere");
    const semData = Buffer.from('{"atta_sign_version":"1","signature":{}}', "utf8");
    const sha = createHash("sha256").update(semData).digest("hex");
    const m = { ...MATERIAL, payload_canonical_b64: semData.toString("base64"), evidence_sha256: sha,
                seals: [{ kid: CHAVE.kid, sig_b64: signEvidence(sha, CHAVE.kid, PEM).sig_b64 }] };
    expect(conferirIntegridade(m, attaCode(sha))).toBe("nao_confere");
  });
  it("verificarCodigo devolve nao_confere quando o selo não passa, e null sem selo", async () => {
    const semSelo = await verificarCodigo(CODIGO, comIp, cliente({ linha: ENCONTRADO, material: { ...MATERIAL, seals: [] } }).c);
    expect(semSelo.ok && semSelo.data.integrity).toBeNull();
    const errado = await verificarCodigo(CODIGO, comIp, cliente({ linha: ENCONTRADO, material: { ...MATERIAL, seal_keys: [] } }).c);
    expect(errado.ok && errado.data.integrity).toBe("nao_confere");
  });
});
