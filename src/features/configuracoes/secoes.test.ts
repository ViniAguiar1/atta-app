import { describe, expect, it } from "vitest";
import { GRUPOS, gruposDisponiveis, primeiraSecaoDisponivel, secaoDisponivel } from "./secoes";

const GRUPOS_DE_TESTE = [
  { titulo: "A", secoes: [{ caminho: "a", titulo: "A1", exibir: "nunca" }] },
  {
    titulo: "B",
    secoes: [
      { caminho: "b", titulo: "B1", exibir: "fora-da-producao" },
      { caminho: "c", titulo: "B2", exibir: "sempre" },
    ],
  },
] as const satisfies Parameters<typeof gruposDisponiveis>[1];

describe("seções de Configurações", () => {
  it("os grupos seguem a ordem do simulador", () => {
    expect(GRUPOS.map((g) => g.titulo)).toEqual(["Início", "Clínica", "Agendamentos", "Documentos", "Pacientes", "Conta"]);
  });

  it("seção sem tela nunca aparece; com porta simulada, só fora da produção; com porta real, sempre", () => {
    const [semTela, simulada, real] = [GRUPOS_DE_TESTE[0].secoes[0], ...GRUPOS_DE_TESTE[1].secoes];
    expect([secaoDisponivel(semTela, false), secaoDisponivel(simulada, false), secaoDisponivel(real, false)]).toEqual([false, true, true]);
    expect([secaoDisponivel(semTela, true), secaoDisponivel(simulada, true), secaoDisponivel(real, true)]).toEqual([false, false, true]);
  });

  it("grupo sem seção disponível some, e a primeira disponível depende do ambiente", () => {
    expect(gruposDisponiveis(true, [...GRUPOS_DE_TESTE]).map((g) => g.secoes.map((s) => s.caminho))).toEqual([["c"]]);
    expect(primeiraSecaoDisponivel(false, [...GRUPOS_DE_TESTE])?.caminho).toBe("b");
    expect(primeiraSecaoDisponivel(true, [GRUPOS_DE_TESTE[0]])).toBeUndefined();
  });
});
