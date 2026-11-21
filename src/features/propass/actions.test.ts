import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lerHashDoConvite: vi.fn(), conferirConselho: vi.fn(), identidade: vi.fn(), termo: vi.fn(), enviar: vi.fn() }));
vi.mock("@/server/propass/cookies", () => ({ lerHashDoConvite: mocks.lerHashDoConvite }));
vi.mock("@/server/propass/porta", () => ({
  portaPropass: { conferirConselho: mocks.conferirConselho, identidade: mocks.identidade, termo: mocks.termo, enviar: mocks.enviar },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Navegador de teste", "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) }));

import { carregarTermo, conferirDados, enviarPropass } from "./actions";

const DADOS = { nome: "Bruna Reis", cpf: "529.982.247-25", whatsapp: "(11) 98765-4321", conselho: "crm", numero: "990001", uf: "SP" };
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
    mocks.identidade.mockResolvedValue({ ok: true, data: "pedir_pin" });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "regularizado", consultadoEm: "2026-11-20T19:24:00.000Z", pedirSenha: true } });
    expect(mocks.conferirConselho).toHaveBeenCalledWith(HASH, { conselho: "crm", numero: "990001", uf: "SP", nome: "Bruna Reis" });
    // identidade com o CPF só no servidor, e a origem do pedido para o limite por IP
    expect(mocks.identidade).toHaveBeenCalledWith(HASH, { conselho: "crm", uf: "SP", numero: "990001", cpf: "52998224725" }, { ip: "203.0.113.7", userAgent: "Navegador de teste" });
    mocks.identidade.mockResolvedValue({ ok: true, data: "usar_pin_existente" });
    expect(await conferirDados(DADOS)).toMatchObject({ ok: true, data: { pedirSenha: false } });
  });

  it("sem cookie, ou link recusado pelo backend, responde como convite vencido", async () => {
    mocks.lerHashDoConvite.mockResolvedValue(null);
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
    mocks.lerHashDoConvite.mockResolvedValue(HASH);
    mocks.conferirConselho.mockResolvedValue({ ok: false, error: { code: "NAO_ENCONTRADO", message: "x" } });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
  });

  it("na produção, com a porta real, confere de verdade (o PROpass está no ar)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    mocks.conferirConselho.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado" } });
    mocks.identidade.mockResolvedValue({ ok: true, data: "pedir_pin" });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "nao_consultado", pedirSenha: true } });
    expect(mocks.lerHashDoConvite).toHaveBeenCalled();
  });

  it("o conselho que não confere nem chega à identidade; link vencido na identidade vira convite vencido", async () => {
    mocks.conferirConselho.mockResolvedValue({ ok: true, data: { situacao: "nao_confere" } });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "nao_confere" } });
    expect(mocks.identidade).not.toHaveBeenCalled();
    mocks.conferirConselho.mockResolvedValue({ ok: true, data: { situacao: "nao_consultado" } });
    mocks.identidade.mockResolvedValue({ ok: false, error: { code: "NAO_ENCONTRADO", message: "x" } });
    expect(await conferirDados(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
  });
});

describe("carregarTermo e enviarPropass (actions)", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgo=";
  const LEITURA = { abertoEm: "2026-11-21T10:00:00.000Z", rolagemCompletaEm: "2026-11-21T10:01:00.000Z" };
  const ENVIO = { dados: DADOS, assinatura: PNG, leuAteOFim: true, pin: "2468", leitura: LEITURA };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lerHashDoConvite.mockResolvedValue(HASH);
  });

  it("o termo vem pronto do servidor; falha do servidor volta como erro (genérico na tela)", async () => {
    mocks.termo.mockResolvedValue({ ok: true, data: { titulo: "T", paragrafos: ["p"] } });
    expect(await carregarTermo(DADOS)).toEqual({ ok: true, data: { situacao: "pronto", termo: { titulo: "T", paragrafos: ["p"] } } });
    expect(mocks.termo).toHaveBeenCalledWith(HASH, { conselho: "crm", numero: "990001", uf: "SP", nome: "Bruna Reis" });
    mocks.termo.mockResolvedValue({ ok: false, error: { code: "CONFLITO", message: "x", reason: "ATTA-IN-0003:termo_de_autorizacao" } });
    expect(await carregarTermo(DADOS)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
  });

  it("o envio passa o PNG em bytes e o PIN à porta, e repassa o desfecho", async () => {
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "ok" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "ok" } });
    const [hash, envio] = mocks.enviar.mock.calls[0]!;
    expect(hash).toBe(HASH);
    expect(envio.pin).toBe("2468");
    expect(Buffer.isBuffer(envio.assinaturaPng)).toBe(true);
    expect(envio.dados).toMatchObject({ cpf: "52998224725", whatsapp: "11987654321" });
    expect(envio.leitura).toEqual({ abertoEm: new Date(LEITURA.abertoEm), rolagemCompletaEm: new Date(LEITURA.rolagemCompletaEm) });
    expect(envio.origem).toEqual({ ip: "203.0.113.7", userAgent: "Navegador de teste" });
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "recusado" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "recusado" } });
    // quem já tem a senha envia sem PIN
    mocks.enviar.mockResolvedValue({ ok: true, data: { status: "ok" } });
    expect(await enviarPropass({ ...ENVIO, pin: null })).toEqual({ ok: true, data: { status: "ok" } });
    expect(mocks.enviar.mock.calls.at(-1)![1].pin).toBeNull();
  });

  it("sem leitura até o fim ou com PIN óbvio, recusa sem chamar a porta", async () => {
    expect(await enviarPropass({ ...ENVIO, leuAteOFim: false })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(await enviarPropass({ ...ENVIO, pin: "1111" })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(await enviarPropass({ ...ENVIO, leitura: { abertoEm: LEITURA.rolagemCompletaEm, rolagemCompletaEm: LEITURA.abertoEm } })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("sem cookie do convite, responde como link vencido, também na produção", async () => {
    mocks.lerHashDoConvite.mockResolvedValue(null);
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "link_sem_validade" } });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(await carregarTermo(DADOS)).toEqual({ ok: true, data: { situacao: "link_sem_validade" } });
    expect(mocks.termo).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("limite e senha recusada pelo servidor viram desfechos da tela, sem texto do banco", async () => {
    mocks.enviar.mockResolvedValue({ ok: false, error: { code: "LIMITE", message: "x" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "limite" } });
    mocks.enviar.mockResolvedValue({ ok: false, error: { code: "VALIDACAO", message: "x", fields: [{ campo: "pin", code: "VALIDACAO" }], reason: "ATTA-IN-0001:pin_obvio" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "senha_invalida", motivo: "obvio" } });
    mocks.enviar.mockResolvedValue({ ok: false, error: { code: "VALIDACAO", message: "x", fields: [{ campo: "pin", code: "VALIDACAO" }], reason: "ATTA-IN-0001:pin_existente" } });
    expect(await enviarPropass(ENVIO)).toEqual({ ok: true, data: { status: "senha_invalida", motivo: "outro" } });
  });
});
