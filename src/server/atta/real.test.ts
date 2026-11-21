import { beforeEach, describe, expect, it, vi } from "vitest";

// Porta real do ATTA com o cliente do Supabase simulado: confere quais funções vão ao banco (pacientes pelo
// api.patient_count, sem trazer linha de paciente) e que erro vira null, para a tela mostrar "—".
const rpc = vi.fn();
const contagemDeServicos = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({
    schema: (nome: string) =>
      nome === "api" ? { rpc } : { from: () => ({ select: () => ({ is: () => ({ then: (f: (r: unknown) => unknown) => Promise.resolve(contagemDeServicos()).then(f) }) }) }) },
  }),
}));

const { portaAttaReal } = await import("./real");

const respostas: Record<string, { data: unknown; error: unknown }> = {};
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation((fn: string) => ({ then: (f: (r: unknown) => unknown) => Promise.resolve(respostas[fn] ?? { data: null, error: { code: "x" } }).then(f) }));
  contagemDeServicos.mockReset().mockReturnValue({ count: 5, error: null });
  respostas.team_list = { data: [{ status: "active" }, { status: "active" }, { status: "invited" }], error: null };
  respostas.atta_in_template_list = { data: [{}, {}, {}], error: null };
  respostas.patient_count = { data: 12, error: null };
});

describe("portaAttaReal.resumoDosDados", () => {
  it("conta pacientes pelo api.patient_count, sem chamar o patient_list", async () => {
    const r = await portaAttaReal.resumoDosDados();
    expect(r).toMatchObject({ membros: 2, procedimentos: 5, modelos: 3, pacientes: 12 });
    expect(rpc.mock.calls.map((c) => c[0])).toContain("patient_count");
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("patient_list");
  });

  it("clínica sem paciente ativo dá 0, de verdade", async () => {
    respostas.patient_count = { data: 0, error: null };
    expect((await portaAttaReal.resumoDosDados()).pacientes).toBe(0);
  });

  it("erro em uma contagem vira null (a tela mostra —) e as outras seguem", async () => {
    respostas.patient_count = { data: null, error: { code: "42501" } };
    respostas.team_list = { data: null, error: { code: "42501" } }; // COLABORADOR: team_list é só do ADMIN
    const r = await portaAttaReal.resumoDosDados();
    expect(r.pacientes).toBeNull();
    expect(r.membros).toBeNull();
    expect(r.modelos).toBe(3);
    expect(r.documentosAssinados).toBeNull();
  });
});
