import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// As server actions de entrada do check-in também recusam na produção enquanto a porta é a simulada (S3-4 da
// Segurança): a página dar 404 não basta, porque a action é um POST que pode ser chamado direto.
const portaCheckin = vi.hoisted(() => ({ iniciar: vi.fn(), confirmar: vi.fn(), reenviar: vi.fn(), clinica: vi.fn() }));
const portaCadastro = vi.hoisted(() => ({ carregar: vi.fn(), salvar: vi.fn(), buscarCep: vi.fn() }));
vi.mock("@/server/checkin/porta", () => ({ portaCheckin }));
vi.mock("@/server/cadastro/porta", () => ({ portaCadastro }));
vi.mock("@/server/checkin/sessao-simulada", () => ({ lerSessaoSimulada: vi.fn().mockResolvedValue("00000000-1111-4111-8111-111111111111") }));

const checkin = await import("./actions");
const cadastro = await import("./cadastro/actions");
const DESAFIO = "00000000-1111-4111-8111-111111111111";

describe("actions do check-in na produção (porta simulada)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("recusam como rota inexistente e nem chegam à porta", async () => {
    const respostas = [
      await checkin.iniciarCheckin({ portal: "aurora", cpf: "52998224725" }), // CPF gerado
      await checkin.confirmarCodigo({ desafio: DESAFIO, codigo: "123456" }),
      await checkin.reenviarCodigo({ desafio: DESAFIO }),
      await cadastro.carregarDados(),
      await cadastro.salvarDados({}),
      await cadastro.buscarCep("01310100"),
    ];
    for (const r of respostas) expect(r).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
    for (const f of [...Object.values(portaCheckin), ...Object.values(portaCadastro)]) expect(f).not.toHaveBeenCalled();
  });

  it("na prévia, a action chega à porta", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    portaCheckin.iniciar.mockResolvedValue({ ok: true, data: { desafio: DESAFIO, finalCelular: "4321" } });
    await checkin.iniciarCheckin({ portal: "aurora", cpf: "52998224725" });
    expect(portaCheckin.iniciar).toHaveBeenCalled();
  });
});
