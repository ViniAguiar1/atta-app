import { describe, expect, it } from "vitest";
import { diaSchema, resumoSchema } from "@/features/agenda/schema";
import { escolherPortaAgenda } from "./porta";
import { portaAgendaReal } from "./real";
import { portaAgendaSimulada } from "./simulado";
import { portaAgendaVazia } from "./vazia";

// Regra de stage (Tech Lead Frontend, 20/11): na produção, sem leitura real, nada de dado de mentira.
describe("porta vazia da agenda", () => {
  it("dia vazio no hoje da clínica, resumo com totais nulos e nenhum aviso", async () => {
    const dia = await portaAgendaVazia.dia({});
    expect(dia.ok && diaSchema.parse(dia.data).linhas).toEqual([]);
    const resumo = await portaAgendaVazia.resumo({});
    expect(resumo.ok && resumoSchema.parse(resumo.data)).toMatchObject({ hojeFaltam: null, semDocumento: null });
    expect(await portaAgendaVazia.avisos()).toEqual({ ok: true, data: [] });
  });
});

describe("escolha da porta por ambiente", () => {
  it("o dia e os cards vêm do banco em todos os ambientes", () => {
    for (const ambiente of ["production", "preview", "development", undefined]) {
      const porta = escolherPortaAgenda(ambiente);
      expect(porta.dia).toBe(portaAgendaReal.dia);
      expect(porta.resumo).toBe(portaAgendaReal.resumo);
    }
  });

  it("Todos e Concluídos também vêm do banco (#183) em todos os ambientes", () => {
    for (const ambiente of ["production", "preview", "development", undefined]) {
      const porta = escolherPortaAgenda(ambiente);
      expect(porta.periodo).toBe(portaAgendaReal.periodo);
      expect(porta.concluidos).toBe(portaAgendaReal.concluidos);
    }
  });

  it("sem leitura real (avisos, até o agenda_alerts): vazia na produção, simulada na prévia, no local e no CI", () => {
    expect(escolherPortaAgenda("production").avisos).toBe(portaAgendaVazia.avisos);
    for (const ambiente of ["preview", "development", undefined]) {
      expect(escolherPortaAgenda(ambiente).avisos).toBe(portaAgendaSimulada.avisos);
    }
  });
});
