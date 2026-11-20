import { describe, expect, it } from "vitest";
import { avisoSchema, diaSchema, resumoSchema, STATUS } from "@/features/agenda/schema";
import { hojeNaClinica, portaAgendaSimulada as porta } from "./simulado";

const dados = async <T>(p: Promise<{ ok: true; data: T } | { ok: false; error: unknown }>) => {
  const r = await p;
  if (!r.ok) throw new Error("esperava ok");
  return r.data;
};

describe("porta simulada da agenda", () => {
  it("o dia de hoje segue o contrato e vem por horário, com o hoje da clínica", async () => {
    const dia = await dados(porta.dia({}));
    expect(diaSchema.parse(dia)).toEqual(dia);
    expect(dia.dataLocal).toBe(hojeNaClinica());
    expect(dia.hojeLocal).toBe(dia.dataLocal);
    const inicios = dia.linhas.map((l) => l.inicio);
    expect([...inicios].sort()).toEqual(inicios);
  });

  it("cobre os estados do Hoje (sem Concluído, que sai da lista) e o selo Atrasado", async () => {
    const { linhas } = await dados(porta.dia({}));
    const vistos = new Set(linhas.map((l) => l.status));
    expect([...STATUS].filter((s) => !vistos.has(s))).toEqual(["concluido"]);
    expect(linhas.some((l) => l.atrasado && l.status === "agendado")).toBe(true);
  });

  it("o CPF vem só mascarado, com o ponto médio", async () => {
    const { linhas } = await dados(porta.dia({}));
    for (const l of linhas) expect(l.paciente.cpfMascarado).toMatch(/^···\.···\.\d{3}-\d{2}$/);
  });

  it("editar só fica habilitado no Agendado (§10.2.2)", async () => {
    const { linhas } = await dados(porta.dia({}));
    for (const l of linhas) {
      const editar = l.acoes.find((a) => a.acao === "editar");
      if (l.status === "agendado") expect(editar).toEqual({ acao: "editar" });
      else expect(editar === undefined || Boolean(editar.desabilitadaPor)).toBe(true);
    }
  });

  it("busca por nome sem acento e por CPF completo; dia que não é hoje vem vazio", async () => {
    expect((await dados(porta.dia({ busca: "julIANA" }))).linhas.map((l) => l.paciente.nomeExibicao)).toEqual([
      "Juliana Prates",
    ]);
    expect((await dados(porta.dia({ busca: "431.572.801-20" }))).linhas).toHaveLength(1);
    expect((await dados(porta.dia({ busca: "ninguém com esse nome" }))).linhas).toEqual([]);
    expect((await dados(porta.dia({ dataLocal: "2020-01-01" }))).linhas).toEqual([]);
  });

  it("filtra pelo profissional", async () => {
    const todas = (await dados(porta.dia({}))).linhas;
    const vinculo = todas[0]?.profissional.vinculoId ?? "";
    const dele = (await dados(porta.dia({ vinculoProfissionalId: vinculo }))).linhas;
    expect(dele.length).toBeGreaterThan(0);
    expect(dele.length).toBeLessThan(todas.length);
    expect(dele.every((l) => l.profissional.vinculoId === vinculo)).toBe(true);
  });

  it("recusa filtro fora do formato sem ecoar o valor", async () => {
    const r = await porta.dia({ dataLocal: "20/11/2026" });
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDACAO", fields: [{ campo: "dataLocal" }] } });
    expect(JSON.stringify(r)).not.toContain("20/11/2026");
  });

  it("resumo e avisos seguem o contrato", async () => {
    const resumo = await dados(porta.resumo({}));
    expect(resumoSchema.parse(resumo)).toEqual(resumo);
    const avisos = await dados(porta.avisos());
    expect(avisos.map((a) => avisoSchema.parse(a).tipo)).toEqual([
      "sem_documento",
      "atrasado",
      "pronto_sem_boarding_check",
      "ausentes",
    ]);
  });
});
