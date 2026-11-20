import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lerHashDoConvite: vi.fn(), conferirConselho: vi.fn() }));
vi.mock("@/server/propass/cookies", () => ({ lerHashDoConvite: mocks.lerHashDoConvite }));
vi.mock("@/server/propass/porta", () => ({ portaPropass: { conferirConselho: mocks.conferirConselho } }));

import { conferirDados } from "./actions";

const DADOS = { nome: "Bruna Reis", cpf: "529.982.247-25", whatsapp: "(11) 98765-4321", conselho: "crm", numero: "201577", uf: "SP" };
const HASH = Buffer.alloc(32, 3);

describe("conferirDados (action)", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerHashDoConvite.mockResolvedValue(HASH);
  });

  it("recusa formato inválido sem chamar a porta", async () => {
    expect(await conferirDados({ ...DADOS, cpf: "123" })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.conferirConselho).not.toHaveBeenCalled();
  });

  it("passa à porta só o hash e o registro no conselho, sem CPF nem WhatsApp", async () => {
    mocks.conferirConselho.mockResolvedValue({ ok: true, data: { situacao: "regularizado", consultadoEm: "2026-11-20T19:24:00.000Z" } });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "regularizado", consultadoEm: "2026-11-20T19:24:00.000Z" } });
    expect(mocks.conferirConselho).toHaveBeenCalledWith(HASH, { conselho: "crm", numero: "201577", uf: "SP", nome: "Bruna Reis" });
  });

  it("sem cookie, ou link recusado pelo backend, responde como convite vencido", async () => {
    mocks.lerHashDoConvite.mockResolvedValue(null);
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
    mocks.lerHashDoConvite.mockResolvedValue(HASH);
    mocks.conferirConselho.mockResolvedValue({ ok: false, error: { code: "NAO_ENCONTRADO", message: "x" } });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
  });

  it("na produção, com a porta simulada, recusa sem ler cookie nem chamar a porta", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await conferirDados(DADOS)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO", message: "Não encontrado." } });
    expect(mocks.lerHashDoConvite).not.toHaveBeenCalled();
  });
});
