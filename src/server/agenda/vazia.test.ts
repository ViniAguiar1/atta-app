import { describe, expect, it } from "vitest";
import { diaSchema, resumoSchema } from "@/features/agenda/schema";
import { escolherPortaAgenda } from "./porta";
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
  it("produção usa a vazia; prévia, local e CI usam a simulada", () => {
    expect(escolherPortaAgenda("production")).toBe(portaAgendaVazia);
    expect(escolherPortaAgenda("preview")).toBe(portaAgendaSimulada);
    expect(escolherPortaAgenda("development")).toBe(portaAgendaSimulada);
    expect(escolherPortaAgenda(undefined)).toBe(portaAgendaSimulada);
  });
});
