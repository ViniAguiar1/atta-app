import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lerHashDoConvite: vi.fn(), conferirConselho: vi.fn(), termo: vi.fn(), enviar: vi.fn() }));
vi.mock("@/server/propass/cookies", () => ({ lerHashDoConvite: mocks.lerHashDoConvite }));
vi.mock("@/server/propass/porta", () => ({ portaPropass: { conferirConselho: mocks.conferirConselho, termo: mocks.termo, enviar: mocks.enviar } }));

import { carregarTermo, conferirDados, enviarPropass } from "./actions";

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

describe("carregarTermo e enviarPropass (actions)", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const ENVIO = { dados: DADOS, assinatura: PNG, leuAteOFim: true, pin: "2468" };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerHashDoConvite.mockResolvedValue(HASH);
  });

  it("o termo vem pronto do servidor; sem modelo ativo é sem_termo", async () => {
    mocks.termo.mockResolvedValue({ ok: true, data: { titulo: "T", paragrafos: ["p"] } });
    expect(await carregarTermo(DADOS)).toEqual({ ok: true, data: { situacao: "pronto", termo: { titulo: "T", paragrafos: ["p"] } } });
    expect(mocks.termo).toHaveBeenCalledWith(HASH, { conselho: "crm", numero: "201577", uf: "SP", nome: "Bruna Reis" });
    mocks.termo.mockResolvedValue({ ok: false, error: { code: "CONFLITO", message: "x", reason: "ATTA-IN-0003:authorization_template" } });
    expect(await carregarTermo(DADOS)).toEqual({ ok: true, data: { situacao: "sem_termo" } });
  });

  it("o envio passa o PNG em bytes e o PIN à porta, e repassa o desfecho", async () => {
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "ok" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "ok" } });
    const [hash, envio] = mocks.enviar.mock.calls[0]!;
    expect(hash).toBe(HASH);
    expect(envio.pin).toBe("2468");
    expect(Buffer.isBuffer(envio.assinaturaPng)).toBe(true);
    expect(envio.dados).toMatchObject({ cpf: "52998224725", whatsapp: "11987654321" });
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "recusado" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "recusado" } });
  });

  it("sem leitura até o fim ou com PIN óbvio, recusa sem chamar a porta", async () => {
    expect(await enviarPropass({ ...ENVIO, leuAteOFim: false })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(await enviarPropass({ ...ENVIO, pin: "1111" })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("sem cookie do convite, responde como link vencido; na produção, recusa antes de tudo", async () => {
    mocks.lerHashDoConvite.mockResolvedValue(null);
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "link_sem_validade" } });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await carregarTermo(DADOS)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    vi.unstubAllEnvs();
  });
});
