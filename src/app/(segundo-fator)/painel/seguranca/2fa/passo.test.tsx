import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const nivel = vi.fn(async () => ({ data: { currentLevel: "aal1" } }));
const fatores = vi.fn(async () => ({ data: { totp: [] } }));
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({ auth: { getClaims, mfa: { getAuthenticatorAssuranceLevel: nivel, listFactors: fatores } } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("./SegundoFator", () => ({ SegundoFator: (p: { passo: { tipo: string } }) => p.passo.tipo }));

const { Passo } = await import("./passo");
const abrir = (volta?: string) => Passo({ searchParams: Promise.resolve(volta ? { volta } : {}) });

beforeEach(() => getClaims.mockReset());

// Segunda trava do 2º fator (passo.tsx), fora do layout do painel (Segurança e Frontend 2, #230)
describe("tela do 2º fator", () => {
  it("sem sessão, vai ao login com a volta para o 2º fator (e o destino original), sem mostrar passo", async () => {
    getClaims.mockResolvedValue({ data: null });
    const erro = await abrir("/painel/configuracoes/agendamentos").catch((e: Error) => e.message);
    expect(erro).toMatch(/^redirect:\/login\?volta=/);
    const volta = new URL(`http://x${String(erro).replace("redirect:", "")}`).searchParams.get("volta");
    expect(volta).toBe("/painel/seguranca/2fa?volta=%2Fpainel%2Fconfiguracoes%2Fagendamentos");
    expect(nivel).not.toHaveBeenCalled();
  });

  it("sem sessão e com um volta de fora, o destinoSeguro troca pelo padrão antes de ir ao login", async () => {
    getClaims.mockResolvedValue({ data: null });
    const erro = String(await abrir("https://fora.exemplo/x").catch((e: Error) => e.message));
    expect(erro).not.toContain("fora.exemplo");
  });

  it("com sessão, segue para o passo de ativar ou confirmar", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u-1" } } });
    const tela = (await abrir()) as { props: { passo: { tipo: string } } };
    expect(tela.props.passo.tipo).toBe("ativar");
  });
});
