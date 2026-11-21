import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ criarClienteServidor: vi.fn() }));
const { matrizDoColaborador } = await import("./sessao");

// Cliente falso que aplica os filtros de verdade sobre as linhas que a RLS devolveria a quem tem team.view: o vínculo e a
// matriz da clínica inteira, não só os do usuário.
type Linha = Record<string, unknown>;
function cliente(tabelas: Record<string, Linha[]>, erro?: { tabela: string }) {
  return {
    schema: () => ({
      from: (tabela: string) => {
        let linhas = tabelas[tabela] ?? [];
        const q = {
          select: () => q,
          eq: (col: string, v: unknown) => ((linhas = linhas.filter((l) => l[col] === v)), q),
          is: (col: string, v: unknown) => ((linhas = linhas.filter((l) => l[col] === v)), q),
          maybeSingle: async () => (erro?.tabela === tabela ? { data: null, error: { code: "X" } } : linhas.length > 1 ? { data: null, error: { code: "PGRST116" } } : { data: linhas[0] ?? null, error: null }),
          then: (resolve: (r: unknown) => void) => resolve(erro?.tabela === tabela ? { data: null, error: { code: "X" } } : { data: linhas, error: null }),
        };
        return q;
      },
    }),
  } as never;
}

const CLINICA = {
  membership: [
    { id: "m-ana", user_id: "u-ana", status: "active", deleted_at: null },
    { id: "m-bia", user_id: "u-bia", status: "active", deleted_at: null },
  ],
  membership_permission: [
    { membership_id: "m-ana", module: "appointments", action: "view" },
    { membership_id: "m-bia", module: "metrics", action: "view" }, // a colega tem Métricas; a Ana não
  ],
};

describe("matriz do Colaborador na sessão (MIG-46; ❌ da Segurança e do Frontend 2 no #201)", () => {
  it("lê só a matriz do próprio vínculo, mesmo quando a RLS devolve a da clínica inteira", async () => {
    expect(await matrizDoColaborador(cliente(CLINICA), "u-ana")).toEqual(["appointments.view"]);
    expect(await matrizDoColaborador(cliente(CLINICA), "u-bia")).toEqual(["metrics.view"]);
  });

  it("falha fechada: sem vínculo ativo, com erro no vínculo ou na matriz, lista vazia", async () => {
    expect(await matrizDoColaborador(cliente(CLINICA), "u-outra")).toEqual([]);
    expect(await matrizDoColaborador(cliente({ ...CLINICA, membership: [{ ...CLINICA.membership[0]!, status: "suspended" }] }), "u-ana")).toEqual([]);
    expect(await matrizDoColaborador(cliente(CLINICA, { tabela: "membership" }), "u-ana")).toEqual([]);
    expect(await matrizDoColaborador(cliente(CLINICA, { tabela: "membership_permission" }), "u-ana")).toEqual([]);
  });
});
