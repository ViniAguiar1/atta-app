import { beforeAll, describe, expect, it, vi } from "vitest";
import { diaSchema, resumoSchema } from "@/features/agenda/schema";
import { argumentosDaBusca, criarPortaAgendaReal, type ClienteDaAgenda } from "./real";

// Porta real contra um cliente falso, no formato combinado com o Backend 2 (mig-41-agenda-contrato.md). Só dado
// fictício: CPF gerado, nomes do simulador, pepper de teste. Quando o MIG-11c entrar, o e2e prova contra o banco local.
beforeAll(() => {
  vi.stubEnv("ATTA_CPF_PEPPER", "ab".repeat(32)); // pepper fictício, só deste teste
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const linha = (over: Record<string, unknown> = {}) => ({
  id: id(1),
  starts_at: "2026-11-20T09:30:00-03:00",
  duration_min: 60,
  appointment_type: "procedimento",
  modality: "presencial",
  patient: { person_id: id(301), provisional_patient_id: null, display_name: "Mariana Costa Albuquerque", cpf_masked: "···.···.484-35" },
  services: [{ id: id(101), name: "Toxina botulínica" }],
  professional: { link_id: id(901), display_name: "Dra. Helena Prado" },
  documents: [{ id: id(201), name: "Consentimento: toxina botulínica", optional: false, state: "vinculado" }],
  status: "agendado",
  late: true,
  confirmation: "confirmado",
  boarding_check_sent_at: null,
  allowed_actions: [{ action: "editar", disabled_reason: null }, { action: "detalhes" }],
  ...over,
});

const dia = (linhas: unknown[]) => ({
  local_date: "2026-11-20",
  today_local_date: "2026-11-20",
  timezone: "America/Sao_Paulo",
  data: linhas,
  page: { next_cursor: null },
});

function clienteFalso(resposta: { data: unknown; error: unknown }) {
  const rpc = vi.fn<(fn: string, args: Record<string, unknown>) => Promise<typeof resposta>>(async () => resposta);
  const cliente = { schema: () => ({ rpc }) } as unknown as ClienteDaAgenda;
  return { rpc, porta: criarPortaAgendaReal(async () => cliente) };
}

describe("porta real da agenda: dia", () => {
  it("chama api.agenda_day com o vínculo do profissional e transforma a resposta no contrato da tela", async () => {
    const { rpc, porta } = clienteFalso({ data: dia([linha()]), error: null });
    const r = await porta.dia({ dataLocal: "2026-11-20", vinculoProfissionalId: id(901) });
    expect(rpc).toHaveBeenCalledWith("agenda_day", { p_local_date: "2026-11-20", p_professional_link_id: id(901) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(diaSchema.parse(r.data)).toEqual(r.data);
    expect(r.data.fuso).toBe("America/Sao_Paulo");
    const [l] = r.data.linhas;
    expect(l?.paciente).toEqual({
      tipo: "pessoa",
      id: id(301),
      nomeExibicao: "Mariana Costa Albuquerque",
      cpfMascarado: "···.···.484-35",
      iniciais: "MA",
    });
    expect(l?.atrasado).toBe(true);
    expect(l?.acoes).toEqual([{ acao: "editar" }, { acao: "detalhes" }]);
  });

  it("paciente provisório da importação vira tipo provisorio; disabled_reason vira desabilitadaPor", async () => {
    const provisorio = linha({
      patient: { person_id: null, provisional_patient_id: id(401), display_name: "Carla Siqueira", cpf_masked: null },
      status: "em_preenchimento",
      allowed_actions: [{ action: "editar", disabled_reason: "edit_after_checkin" }],
    });
    const { porta } = clienteFalso({ data: dia([provisorio]), error: null });
    const r = await porta.dia({});
    if (!r.ok) throw new Error("esperava ok");
    expect(r.data.linhas[0]?.paciente).toMatchObject({ tipo: "provisorio", id: id(401), cpfMascarado: null });
    expect(r.data.linhas[0]?.acoes).toEqual([{ acao: "editar", desabilitadaPor: "edit_after_checkin" }]);
  });

  it("linha fora do contrato (os dois ids do paciente, status desconhecido) sai da lista sem derrubar o dia", async () => {
    const ruins = [
      linha({ id: id(2), patient: { person_id: id(1), provisional_patient_id: id(2), display_name: "X Y", cpf_masked: null } }),
      linha({ id: id(3), status: "liberado" }),
    ];
    const { porta } = clienteFalso({ data: dia([linha(), ...ruins]), error: null });
    const r = await porta.dia({});
    if (!r.ok) throw new Error("esperava ok");
    expect(r.data.linhas.map((l) => l.id)).toEqual([id(1)]);
    expect(JSON.stringify(r)).not.toContain("liberado");
  });

  it("dia fora do contrato é INTERNO, sem repassar o corpo", async () => {
    const { porta } = clienteFalso({ data: { local_date: "ontem", data: [linha()] }, error: null });
    const r = await porta.dia({});
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(JSON.stringify(r)).not.toContain("Mariana");
  });

  it("erro do banco sai por falhaDoBanco, com o reason", async () => {
    const { porta } = clienteFalso({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: null, hint: null } });
    expect(await porta.dia({})).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO", reason: "ATTA-AUTH-0004" } });
  });
});

describe("porta real da agenda: filtros dos cards", () => {
  it("estado do Check-in vai em p_status e sem documento em p_no_document", async () => {
    const { rpc, porta } = clienteFalso({ data: dia([]), error: null });
    await porta.dia({ status: ["pronto"] });
    expect(rpc).toHaveBeenLastCalledWith("agenda_day", { p_status: ["pronto"] });
    await porta.dia({ semDocumento: true });
    expect(rpc).toHaveBeenLastCalledWith("agenda_day", { p_no_document: true });
  });
});

describe("porta real da agenda: busca", () => {
  it("nome com 2+ letras vai em p_search; CPF inteiro vira HMAC em hex com \\x, nunca em claro", async () => {
    expect(argumentosDaBusca("Juliana")).toEqual({ p_search: "Juliana" });
    const cpf = argumentosDaBusca("431.572.801-20");
    if (cpf === null || cpf === "indisponivel") throw new Error("esperava o HMAC");
    expect(Object.keys(cpf ?? {})).toEqual(["p_cpf_hmac"]);
    expect(cpf?.p_cpf_hmac).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(JSON.stringify(cpf)).not.toContain("43157280120");
    expect(argumentosDaBusca("")).toEqual({});
    expect(argumentosDaBusca(undefined)).toEqual({});
  });

  it("CPF pela metade ou 1 letra é recusado sem chamar o banco (nada de prefixo de CPF)", async () => {
    const { rpc, porta } = clienteFalso({ data: dia([]), error: null });
    for (const termo of ["431.572", "j"]) {
      expect(await porta.dia({ busca: termo })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("a chamada leva só o HMAC; o CPF digitado não vai ao banco", async () => {
    const { rpc, porta } = clienteFalso({ data: dia([]), error: null });
    await porta.dia({ busca: "43157280120" });
    const args = rpc.mock.calls[0]?.[1] ?? {};
    expect(JSON.stringify(args)).not.toContain("43157280120");
    expect(args).toHaveProperty("p_cpf_hmac");
    expect(args).not.toHaveProperty("p_search");
  });
});

describe("porta real da agenda: HMAC indisponível", () => {
  const quebrado = () => {
    throw new Error("ATTA_CPF_PEPPER ausente ou malformado");
  };

  it("pepper ausente ou recusado: a busca por CPF devolve INTERNO, sem chamar o banco e sem o CPF no resultado", async () => {
    expect(argumentosDaBusca("431.572.801-20", quebrado)).toBe("indisponivel");
    const rpc = vi.fn();
    const porta = criarPortaAgendaReal(async () => ({ schema: () => ({ rpc }) }) as unknown as ClienteDaAgenda, quebrado);
    const r = await porta.dia({ busca: "431.572.801-20" });
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toMatch(/431|572|801/);
  });

  it("a busca por nome não depende do pepper", () => {
    expect(argumentosDaBusca("Juliana", quebrado)).toEqual({ p_search: "Juliana" });
  });
});

describe("porta real da agenda: Todos e Concluídos (agenda_range)", () => {
  const range = (view: "todos" | "concluidos", linhas: unknown[]) => ({
    view,
    from: "2026-11-21",
    to: "2027-02-20",
    today_local_date: "2026-11-21",
    timezone: "America/Sao_Paulo",
    data: linhas,
    page: { next_cursor: null },
  });

  it("Todos sem período: só a view (o banco usa hoje até +91); com período, estado e busca, os argumentos certos", async () => {
    const { rpc, porta } = clienteFalso({ data: range("todos", [linha()]), error: null });
    const r = await porta.periodo({});
    expect(rpc).toHaveBeenLastCalledWith("agenda_range", { p_view: "todos" });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.data).toMatchObject({ hojeLocal: "2026-11-21", fuso: "America/Sao_Paulo", proximoCursor: null });
    expect(r.data.linhas.map((l) => l.id)).toEqual([id(1)]);

    await porta.periodo({ de: "2026-11-22", ate: "2026-11-30", status: ["agendado"], busca: "Juliana", vinculoProfissionalId: id(901) });
    expect(rpc).toHaveBeenLastCalledWith("agenda_range", {
      p_view: "todos",
      p_from: "2026-11-22",
      p_to: "2026-11-30",
      p_status: ["agendado"],
      p_professional_link_id: id(901),
      p_search: "Juliana",
    });
  });

  it("Concluídos: semana ou mês calculado no banco; CPF inteiro só como HMAC", async () => {
    const { rpc, porta } = clienteFalso({ data: range("concluidos", [linha({ status: "concluido" })]), error: null });
    const r = await porta.concluidos({ periodo: "mes" });
    expect(rpc).toHaveBeenLastCalledWith("agenda_range", { p_view: "concluidos", p_period: "mes" });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.data.linhas[0]?.status).toBe("concluido");

    await porta.concluidos({ periodo: "semana", busca: "43157280120" });
    const args = rpc.mock.calls.at(-1)?.[1] ?? {};
    expect(args).toMatchObject({ p_view: "concluidos", p_period: "semana" });
    expect(args).toHaveProperty("p_cpf_hmac");
    expect(JSON.stringify(args)).not.toContain("43157280120");
  });

  it("resposta fora do formato é INTERNO; linha inválida sai sem derrubar a lista; erro do banco com reason", async () => {
    const quebrada = clienteFalso({ data: { view: "todos", data: [] }, error: null });
    expect(await quebrada.porta.periodo({})).toMatchObject({ ok: false, error: { code: "INTERNO" } });

    const misturada = clienteFalso({ data: range("todos", [linha(), linha({ id: id(9), status: "liberado" })]), error: null });
    const r = await misturada.porta.periodo({});
    expect(r.ok && r.data.linhas.map((l) => l.id)).toEqual([id(1)]);

    const recusada = clienteFalso({ data: null, error: { code: "P0001", message: "ATTA-IN-0001", details: "period", hint: null } });
    expect(await recusada.porta.concluidos({ periodo: "semana" })).toMatchObject({
      ok: false,
      error: { code: "VALIDACAO", reason: "ATTA-IN-0001:period" },
    });
  });
});

describe("porta real da agenda: ações", () => {
  it("confirmar chama atta_in.confirm_appointment; marcar ausente, o transition para ausente", async () => {
    const schema = vi.fn();
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    schema.mockReturnValue({ rpc });
    const porta = criarPortaAgendaReal(async () => ({ schema }) as unknown as ClienteDaAgenda);
    expect(await porta.acao({ acao: "confirmar", id: id(1) })).toEqual({ ok: true, data: null });
    expect(schema).toHaveBeenLastCalledWith("atta_in");
    expect(rpc).toHaveBeenLastCalledWith("confirm_appointment", { p_id: id(1) });
    await porta.acao({ acao: "marcar_ausente", id: id(2) });
    expect(rpc).toHaveBeenLastCalledWith("transition_appointment", { p_id: id(2), p_to: "ausente" });
  });

  it("recusa do banco sai por falhaDoBanco com o reason; entrada fora do contrato nem chega ao banco", async () => {
    const { porta } = clienteFalso({ data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "status", hint: null } });
    expect(await porta.acao({ acao: "marcar_ausente", id: id(1) })).toMatchObject({
      ok: false,
      error: { code: "CONFLITO", reason: "ATTA-IN-0003:status" },
    });
    const { rpc, porta: outra } = clienteFalso({ data: null, error: null });
    // @ts-expect-error ação sem destino não está no contrato
    expect(await outra.acao({ acao: "remarcar", id: id(1) })).toMatchObject({ ok: false, error: { code: "VALIDACAO" } });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("porta real da agenda: resumo", () => {
  it("resumo vem de api.agenda_summary, no contrato da tela", async () => {
    const banco = {
      today_remaining: 5,
      today_concluded: 1,
      month_concluded: 2,
      month_free_slots: 175,
      checkin: { em_preenchimento: 1, pronto: 0, em_atendimento: 1 },
      confirmation: { agendados: 6, a_confirmar: 2, confirmados: 4 },
      no_document: 1,
    };
    const { rpc, porta } = clienteFalso({ data: banco, error: null });
    const r = await porta.resumo({ vinculoProfissionalId: id(901) });
    expect(rpc).toHaveBeenCalledWith("agenda_summary", { p_professional_link_id: id(901) });
    if (!r.ok) throw new Error("esperava ok");
    expect(resumoSchema.parse(r.data)).toEqual(r.data);
    expect(r.data).toMatchObject({ hojeFaltam: 5, mesHorariosLivres: 175, semDocumento: 1 });
  });

});
