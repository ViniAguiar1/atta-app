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
const abrir = () => Passo({ searchParams: Promise.resolve({}) });

beforeEach(() => getClaims.mockReset());

// Segunda trava do 2º fator (passo.tsx), fora do layout do painel (Segurança e Frontend 2, #230)
describe("tela do 2º fator", () => {
  it("sem sessão, vai ao login com a volta para o 2º fator, sem mostrar passo", async () => {
    getClaims.mockResolvedValue({ data: null });
    await expect(abrir()).rejects.toThrow("redirect:/login?volta=%2Fpainel%2Fseguranca%2F2fa");
    expect(nivel).not.toHaveBeenCalled();
  });

  it("com sessão, segue para o passo de ativar ou confirmar", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "u-1" } } });
    const tela = (await abrir()) as { props: { passo: { tipo: string } } };
    expect(tela.props.passo.tipo).toBe("ativar");
  });
});
