// Porta real do Boarding Check (MIG-23 parte 3). Banco trocado por cliente falso; ids, hashes e IPs fictícios.
import { beforeAll, describe, expect, it } from "vitest";
import { type ClienteDoBoarding, criarPortaBoardingReal } from "./real";

beforeAll(() => {
  process.env.ATTA_CPF_PEPPER = "07".repeat(32); // o limitador usa o HMAC do valor
});

const LINK = Buffer.alloc(32, 1);
const SESSAO = Buffer.alloc(32, 2);
const MAC = Buffer.alloc(32, 3);
const PROFISSIONAL = "00000000-0000-4000-8000-0000000023f1";
const PIN = "2468";

type Chamada = { fn: string; args: Record<string, unknown> };
type Resposta = { data: unknown; error: { code: string; message: string; details?: string } | null };

function cliente(respostas: Partial<Record<string, Resposta>>, limite = true) {
  const chamadas: Chamada[] = [];
  const c = {
    schema: () => ({
      rpc: (fn: string, args: Record<string, unknown>) => {
        chamadas.push({ fn, args });
        if (fn === "rate_limit_hit") return Promise.resolve({ data: limite, error: null });
        return Promise.resolve(respostas[fn] ?? { data: null, error: null });
      },
    }),
  } as unknown as ClienteDoBoarding;
  return { c, chamadas };
}

function porta(
  respostas: Partial<Record<string, Resposta>>,
  opcoes: { limite?: boolean; mac?: (id: string, pin: string) => Buffer } = {},
) {
  const { c, chamadas } = cliente(respostas, opcoes.limite ?? true);
  const p = criarPortaBoardingReal({
    cliente: () => c,
    recebidos: async () => new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }),
    mac: opcoes.mac ?? (() => Buffer.from(MAC)),
  });
  return { p, chamadas };
}

const hex = (b: Buffer) => `\\x${b.toString("hex")}`;
const conferencia = (status: string, locked_until: string | null = null): Resposta => ({
  data: [{ status, locked_until }],
  error: null,
});

describe("confirmarPin", () => {
  it("o limite por IP vem antes de tudo; passou dele, nem pergunta o profissional", async () => {
    const { p, chamadas } = porta({}, { limite: false });
    const r = await p.confirmarPin(LINK, PIN, SESSAO);
    expect(r).toMatchObject({ ok: false, error: { code: "LIMITE" } });
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit"]);
    expect(chamadas[0]!.args.p_bucket).toBe("boarding.pin.ip");
    expect(JSON.stringify(chamadas[0]!.args)).not.toContain("203.0.113.9"); // o IP não vai ao banco em claro
  });

  it("link sem profissional (vencido, revogado, desconhecido): indisponível, sem conferir PIN", async () => {
    const { p, chamadas } = porta({ boarding_pin_subject: { data: null, error: null } });
    expect(await p.confirmarPin(LINK, PIN, SESSAO)).toEqual({ ok: true, data: { status: "indisponivel" } });
    expect(chamadas.map((x) => x.fn)).toEqual(["rate_limit_hit", "boarding_pin_subject"]);
  });

  it("manda só hashes e o mac, nunca o PIN, e devolve o status do banco", async () => {
    const { p, chamadas } = porta({
      boarding_pin_subject: { data: PROFISSIONAL, error: null },
      boarding_confirm_pin: conferencia("ok"),
    });
    expect(await p.confirmarPin(LINK, PIN, SESSAO)).toEqual({ ok: true, data: { status: "ok" } });
    expect(chamadas[1]!.args).toEqual({ p_link_hash: hex(LINK) });
    expect(chamadas[2]!.args).toEqual({ p_link_hash: hex(LINK), p_pin_mac: hex(MAC), p_session_hash: hex(SESSAO) });
    expect(JSON.stringify(chamadas)).not.toContain(PIN);
  });

  it("o mac é calculado com o profissional do link", async () => {
    const recebidos: string[] = [];
    const { p } = porta(
      { boarding_pin_subject: { data: PROFISSIONAL, error: null }, boarding_confirm_pin: conferencia("pin_incorreto") },
      { mac: (id) => (recebidos.push(id), Buffer.from(MAC)) },
    );
    expect(await p.confirmarPin(LINK, PIN, SESSAO)).toEqual({ ok: true, data: { status: "pin_incorreto" } });
    expect(recebidos).toEqual([PROFISSIONAL]);
  });

  it("bloqueado leva a hora; revogado no 10º erro volta como indisponível", async () => {
    const ate = "2026-11-21T15:00:00.000Z";
    const bloqueado = porta({
      boarding_pin_subject: { data: PROFISSIONAL, error: null },
      boarding_confirm_pin: conferencia("bloqueado", ate),
    });
    expect(await bloqueado.p.confirmarPin(LINK, PIN, SESSAO)).toEqual({ ok: true, data: { status: "bloqueado", bloqueadoAte: ate } });
    const revogado = porta({
      boarding_pin_subject: { data: PROFISSIONAL, error: null },
      boarding_confirm_pin: conferencia("indisponivel"),
    });
    expect(await revogado.p.confirmarPin(LINK, PIN, SESSAO)).toEqual({ ok: true, data: { status: "indisponivel" } });
  });

  it("resposta fora do contrato é erro interno (bloqueado sem hora, status desconhecido, profissional que não é uuid)", async () => {
    for (const respostas of [
      { boarding_pin_subject: { data: PROFISSIONAL, error: null }, boarding_confirm_pin: conferencia("bloqueado") },
      { boarding_pin_subject: { data: PROFISSIONAL, error: null }, boarding_confirm_pin: conferencia("aberto") },
      { boarding_pin_subject: { data: "nao-e-uuid", error: null } },
    ]) {
      expect(await porta(respostas).p.confirmarPin(LINK, PIN, SESSAO)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    }
  });

  it("PIN que o HMAC recusa: PIN incorreto, sem ir ao banco conferir", async () => {
    const { p, chamadas } = porta(
      { boarding_pin_subject: { data: PROFISSIONAL, error: null } },
      { mac: () => { throw new RangeError("PIN fora do formato"); } },
    );
    expect(await p.confirmarPin(LINK, "12", SESSAO)).toEqual({ ok: true, data: { status: "pin_incorreto" } });
    expect(chamadas.map((x) => x.fn)).not.toContain("boarding_confirm_pin");
  });
});

describe("abrir", () => {
  const linha = {
    clinic_name: "Clínica Fictícia Sessão", patient_name: "Paciente Social Fictícia", patient_age: 34,
    starts_at_local: "10:00", appointment_type: "avaliacao", attended_count: 2, absent_count: 1, status: "em_atendimento",
  };

  it("o resumo do topo, com o nome do tipo de atendimento", async () => {
    const { p, chamadas } = porta({ boarding_open: { data: [linha], error: null } });
    expect(await p.abrir(SESSAO)).toEqual({
      ok: true,
      data: {
        clinica: "Clínica Fictícia Sessão",
        paciente: { nome: "Paciente Social Fictícia", idade: 34 },
        horario: "10:00",
        tipoDeAtendimento: "Avaliação",
        comparecimento: { atendimentos: 2, ausencias: 1 },
      },
    });
    expect(chamadas).toEqual([{ fn: "boarding_open", args: { p_session_hash: hex(SESSAO) } }]);
  });

  it("sem data de nascimento, a idade fica nula", async () => {
    const { p } = porta({ boarding_open: { data: [{ ...linha, patient_age: null }], error: null } });
    const r = await p.abrir(SESSAO);
    expect(r.ok && r.data.paciente.idade).toBeNull();
  });

  it("sessão inválida, vencida, de outro profissional ou concluída: NAO_AUTENTICADO", async () => {
    const { p } = porta({ boarding_open: { data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: "grant" } } });
    expect(await p.abrir(SESSAO)).toMatchObject({ ok: false, error: { code: "NAO_AUTENTICADO" } });
  });

  it("atendimento que não está Pronto nem Em atendimento: CONFLITO", async () => {
    const { p } = porta({ boarding_open: { data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "status" } } });
    expect(await p.abrir(SESSAO)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
  });

  it("linha fora do contrato (chave a mais) é erro interno, e a chave não vaza", async () => {
    const { p } = porta({ boarding_open: { data: [{ ...linha, cpf: "000" }], error: null } });
    const r = await p.abrir(SESSAO);
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(JSON.stringify(r)).not.toContain("cpf");
  });
});

describe("concluir", () => {
  it("devolve a hora da conclusão", async () => {
    const { p } = porta({ boarding_complete: { data: "2026-11-21T14:00:00.000Z", error: null } });
    expect(await p.concluir(SESSAO)).toEqual({ ok: true, data: { concluidoEm: "2026-11-21T14:00:00.000Z" } });
  });

  it("termo obrigatório pendente (a trava do §10.2.3): CONFLITO", async () => {
    const { p } = porta({ boarding_complete: { data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "documents" } } });
    expect(await p.concluir(SESSAO)).toMatchObject({ ok: false, error: { code: "CONFLITO" } });
  });

  it("sessão que não vale mais: NAO_AUTENTICADO", async () => {
    const { p } = porta({ boarding_complete: { data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: "grant" } } });
    expect(await p.concluir(SESSAO)).toMatchObject({ ok: false, error: { code: "NAO_AUTENTICADO" } });
  });
});
