import { describe, expect, it } from "vitest";
import { GRUPOS, gruposProntos, primeiraSecaoPronta } from "./secoes";

describe("seções de Configurações", () => {
  it("os grupos seguem a ordem do simulador", () => {
    expect(GRUPOS.map((g) => g.titulo)).toEqual(["Início", "Clínica", "Agendamentos", "Documentos", "Pacientes", "Conta"]);
  });

  it("só aparece seção pronta, e grupo sem seção pronta some (regra do stage)", () => {
    const grupos = gruposProntos([
      { titulo: "A", secoes: [{ caminho: "a", titulo: "A1", pronta: false }] },
      { titulo: "B", secoes: [{ caminho: "b", titulo: "B1", pronta: true }, { caminho: "c", titulo: "B2", pronta: false }] },
    ]);
    expect(grupos).toEqual([{ titulo: "B", secoes: [{ caminho: "b", titulo: "B1", pronta: true }] }]);
  });

  it("sem seção pronta, não há primeira seção (a rota de Configurações dá não encontrada)", () => {
    expect(primeiraSecaoPronta([{ titulo: "A", secoes: [{ caminho: "a", titulo: "A1", pronta: false }] }])).toBeUndefined();
  });
});
