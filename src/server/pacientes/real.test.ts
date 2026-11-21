import { beforeEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith } from "@/server/crypto/cpf";
import { selarContato } from "./contato";

// Porta real com o cliente do Supabase simulado: confere o que vai ao banco (nunca o CPF em claro), o Zod da borda, o
// falhaDoBanco e a abertura do contato pela KEK de teste. Dado fictício: CPF gerado, nome inventado.
vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
vi.stubEnv("ATTA_CPF_PEPPER", CI_TEST_CPF_PEPPER_HEX);

const TENANT = "eeee0000-0000-4000-8000-000000000001";
const rpc = vi.fn();
let claims: Record<string, unknown> | null = { tenant_id: TENANT };
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null }) },
    schema: () => ({ rpc }),
  }),
}));

const { portaPacientesReal: porta, celularParaTela, celularMascarado, emailMascarado } = await import("./real");
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const ID = "eeee0000-0000-4000-8000-000000000101";

async function linha(extra: Record<string, unknown> = {}) {
  const contato = await selarContato({ celular: "11987654321", email: "juliana.prates@exemplo.test" }, { tenant: "", tabela: "network.person" }, ID, cofre);
  return {
    person_id: ID, display_name: "Juliana Prates", display_is_social: false, cpf_masked: "···.···.247-25",
    foreign_doc_masked: null, birth_date: "1990-09-17", is_incomplete: false, is_verified: false, verified_until: null,
    ...contato, envelope_id: ID, network_access: "owner", linked_at: "2026-11-20T12:00:00Z", last_appointment: null,
    documents: [], total_active: 5, count_other_clinic: 1, count_today: 2, count_archived: 0, ...extra,
  };
}

beforeEach(() => {
  rpc.mockReset();
  claims = { tenant_id: TENANT };
});

describe("porta real de Pacientes (MIG-43)", () => {
  it("lista pela api.patient_list, abre o contato no servidor e o devolve mascarado (PDD §19.8)", async () => {
    rpc.mockResolvedValue({ data: [await linha()], error: null });
    const r = await porta.listar();
    expect(rpc).toHaveBeenCalledWith("patient_list", { p_limit: 50 });
    expect(r).toEqual({
      ok: true,
      data: {
        itens: [{
          id: ID, nome: "Juliana Prates", usaNomeSocial: false, incompleto: false, selo: null,
          identificacao: { tipo: "cpf", mascarado: "···.···.247-25" }, nascimento: "1990-09-17",
          contato: { celular: "(11) ·····-4321", email: "ju···@exemplo.test" }, atendimento: null,
        }],
        proxima: null,
        total: 5,
        contadores: { outra_clinica: 1, atendimento_hoje: 2, arquivados: 0 },
      },
    });
  });

  it("pagina pelo cursor (nome, id) e só oferece a próxima com a página cheia", async () => {
    const cheia = await Promise.all(Array.from({ length: 50 }, () => linha()));
    rpc.mockResolvedValue({ data: cheia, error: null });
    const r = await porta.listar({ nome: "Ana", id: ID });
    expect(rpc).toHaveBeenCalledWith("patient_list", { p_limit: 50, p_after_name: "Ana", p_after_id: ID });
    expect(r.ok && r.data.proxima).toEqual({ nome: "Juliana Prates", id: ID });
  });

  it("Incompleto e nome social vêm do banco; sem documento, sem envelope e sem contato", async () => {
    rpc.mockResolvedValue({
      data: [{
        ...(await linha()), display_is_social: true, is_incomplete: true, cpf_masked: null, phone_enc: null, email_enc: null,
        dek_wrapped: null, kek_version: null, envelope_id: null,
      }],
      error: null,
    });
    const r = await porta.listar();
    expect(r.ok && r.data.itens[0]).toMatchObject({ usaNomeSocial: true, incompleto: true, identificacao: { tipo: "incompleto" }, contato: null });
  });

  it("selo válido do banco vira o chip Com selo", async () => {
    rpc.mockResolvedValue({ data: [await linha({ is_verified: true, verified_until: "2027-06-30T00:00:00Z" })], error: null });
    const r = await porta.listar();
    expect(r.ok && r.data.itens[0]?.selo).toBe("com_selo");
  });

  it("selo vencido (verified_until no passado, is_verified falso) vira o chip Selo expirado", async () => {
    rpc.mockResolvedValue({ data: [await linha({ is_verified: false, verified_until: "2026-06-01T00:00:00Z" })], error: null });
    const r = await porta.listar();
    expect(r.ok && r.data.itens[0]?.selo).toBe("selo_expirado");
  });

  it("a busca devolve a mesma linha da lista, com o contato mascarado", async () => {
    rpc.mockResolvedValue({ data: [await linha()], error: null });
    const r = await porta.buscar("juli");
    expect(r.ok && r.data[0]?.contato).toEqual({ celular: "(11) ·····-4321", email: "ju···@exemplo.test" });
    expect(JSON.stringify(r)).not.toContain("98765");
  });

  it("busca por CPF manda só o HMAC do pepper, nunca o CPF; por nome manda o trecho", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await porta.buscar("529.982.247-25");
    const [, args] = rpc.mock.calls[0]!;
    expect(args).toEqual({ p_doc_hmac: `\\x${cpfHmacWith(Buffer.from(CI_TEST_CPF_PEPPER_HEX, "hex"), "52998224725").toString("hex")}` });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("52998224725");
    await porta.buscar("  juli ");
    expect(rpc).toHaveBeenLastCalledWith("patient_search", { p_name: "juli" });
  });

  it("sem o pepper, a busca por CPF é INTERNO (não 500), sem ir ao banco nem ecoar o CPF", async () => {
    vi.resetModules();
    vi.stubEnv("ATTA_CPF_PEPPER", "");
    const { portaPacientesReal: semPepper } = await import("./real");
    const r = await semPepper.buscar("529.982.247-25");
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(JSON.stringify(r)).not.toContain("529");
    expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("ATTA_CPF_PEPPER", CI_TEST_CPF_PEPPER_HEX);
  });

  it("termo curto ou CPF incompleto é VALIDACAO, sem ir ao banco", async () => {
    for (const termo of ["j", "5299822"]) expect((await porta.buscar(termo)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("erro do banco sai pelo falhaDoBanco, com o reason; sem clínica na sessão é NAO_AUTENTICADO", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: null, hint: null } });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO", reason: "ATTA-AUTH-0004" } });
    claims = null;
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "NAO_AUTENTICADO" } });
  });

  it("resposta fora do formato vira INTERNO sem ecoar o conteúdo", async () => {
    rpc.mockResolvedValue({ data: [{ person_id: "x", display_name: "Juliana Prates" }], error: null });
    const r = await porta.listar();
    expect(r).toMatchObject({ ok: false, error: { code: "INTERNO" } });
    expect(JSON.stringify(r)).not.toContain("Juliana");
  });

  it("contato cifrado com outro envelope não abre: INTERNO, nunca o dado trocado", async () => {
    rpc.mockResolvedValue({ data: [await linha({ envelope_id: "eeee0000-0000-4000-8000-000000000199" })], error: null });
    expect(await porta.listar()).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("obter monta a ficha da Pasta, com selo e origem", async () => {
    rpc.mockResolvedValue({
      data: [{
        ...(await linha()), full_name: "Juliana Prates", social_name: null, birth_date: "1990-09-17", foreign_doc_type: null,
        is_incomplete: false, is_verified: true, verified_until: "2027-06-30T00:00:00Z", origin: "atta_me",
      }],
      error: null,
    });
    const r = await porta.obter(ID);
    expect(rpc).toHaveBeenCalledWith("patient_get", { p_person_id: ID });
    expect(r.ok && r.data).toMatchObject({ nascimento: "1990-09-17", selo: { validoAte: "2027-06-30T00:00:00Z" }, seloExpirouEm: null, origem: "atta_me", acessoARede: "proprio" });
  });

  it("arquivar chama patient_set_archived; agendamento em aberto volta como CONFLITO com o reason", async () => {
    rpc.mockResolvedValueOnce({ data: { person_id: ID, archived: true }, error: null });
    expect(await porta.arquivar(ID, true)).toEqual({ ok: true, data: { arquivado: true } });
    expect(rpc).toHaveBeenLastCalledWith("patient_set_archived", { p_person_id: ID, p_archived: true });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "ATTA-IN-0003", details: "appointments", hint: null } });
    expect(await porta.arquivar(ID, true)).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0003:appointments" } });
  });

  it("selo vencido não vale, mas a Pasta recebe a data em que expirou (RN-PAC-06)", async () => {
    rpc.mockResolvedValue({
      data: [{
        ...(await linha()), full_name: "Juliana Prates", social_name: null, birth_date: null, foreign_doc_type: null,
        is_incomplete: false, is_verified: false, verified_until: "2026-06-01T00:00:00Z", origin: "recepcao",
      }],
      error: null,
    });
    const r = await porta.obter(ID);
    expect(r.ok && r.data).toMatchObject({ selo: null, seloExpirouEm: "2026-06-01T00:00:00Z", arquivadoEm: null });
  });

  it("celular e e-mail: formato e máscara (só DDD, 4 finais, 2 letras e domínio)", () => {
    expect(celularParaTela("11987654321")).toBe("(11) 98765-4321");
    expect(celularMascarado("11987654321")).toBe("(11) ·····-4321");
    expect(celularMascarado("1133334444")).toBe("(11) ····-4444");
    expect(celularMascarado(null)).toBe(null);
    // fora de 10/11 dígitos, nunca o valor cru
    expect(celularMascarado("+55 11 98765-4321")).toBe("·····-4321");
    expect(celularMascarado("98765432")).toBe("·····-5432");
    expect(celularMascarado("ligar na recepção")).toBe("···");
    expect(emailMascarado("juliana.prates@exemplo.test")).toBe("ju···@exemplo.test");
    expect(emailMascarado("a@exemplo.test")).toBe("a···@exemplo.test");
  });
});

describe("porta real de Pacientes: agendamentos da Pasta (api.patient_folder_appointments)", () => {
  const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  // linha fictícia no formato do private.agenda_rows, mais os campos da Pasta
  const bruta = (over: Record<string, unknown> = {}) => ({
    id: uid(1),
    starts_at: "2026-11-19T11:30:00-03:00",
    duration_min: 60,
    appointment_type: "procedimento",
    modality: "presencial",
    patient: { person_id: ID, provisional_patient_id: null, display_name: "Juliana Prates", cpf_masked: "···.···.247-25" },
    services: [{ id: uid(101), name: "Peeling químico médio" }],
    professional: { link_id: uid(901), display_name: "Dr. Caio Andrade" },
    documents: [],
    status: "em_atendimento",
    late: false,
    confirmation: "confirmado",
    boarding_check_sent_at: null,
    allowed_actions: [{ action: "detalhes", disabled_reason: null }],
    milestones: { checkin_at: "2026-11-19T11:20:00-03:00", ready_at: null, in_service_at: null, concluded_at: null },
    pending: { kind: "termo_nao_assinado", required: true },
    terms_count: 2,
    clinical_docs_count: 0,
    ...over,
  });
  const resposta = (data: unknown[], extra: Record<string, unknown> = {}) => ({
    totals: { appointments: 2, terms_signed: 1, clinical_docs: 0, pendencies: 1 },
    today: { count: 1, last_at: "2026-11-21T17:00:00+00:00" },
    timezone: "America/Sao_Paulo",
    data,
    page: { next_cursor: null },
    ...extra,
  });

  it("monta a linha da Agenda com marcos, pendência e contagens; totais, hoje e fuso vêm prontos", async () => {
    rpc.mockResolvedValueOnce({ data: resposta([bruta()]), error: null });
    const r = await porta.agendamentosDaPasta(ID);
    expect(rpc).toHaveBeenLastCalledWith("patient_folder_appointments", { p_person_id: ID });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.data.itens[0]).toMatchObject({
      status: "em_atendimento",
      servicos: [{ nome: "Peeling químico médio" }],
      marcos: { checkin: "2026-11-19T11:20:00-03:00", pronto: null },
      pendencia: { tipo: "termo_nao_assinado", obrigatoria: true },
      termos: 2,
      docsClinicos: 0,
    });
    expect(r.data).toMatchObject({ totais: { agendamentos: 2, termosAssinados: 1, pendencias: 1 }, hoje: { quantidade: 1 }, fuso: "America/Sao_Paulo", proximo: null });
  });

  it("o cursor vai ao banco; linha fora do formato sai sem derrubar a lista; resposta quebrada é INTERNO", async () => {
    rpc.mockResolvedValueOnce({ data: resposta([bruta(), bruta({ id: uid(2), pending: { kind: "texto livre", required: true } })]), error: null });
    const r = await porta.agendamentosDaPasta(ID, "2026-11-19T14:30:00.000000Z|" + uid(9));
    expect(rpc).toHaveBeenLastCalledWith("patient_folder_appointments", { p_person_id: ID, p_cursor: "2026-11-19T14:30:00.000000Z|" + uid(9) });
    expect(r.ok && r.data.itens.map((i) => i.id)).toEqual([uid(1)]);
    rpc.mockResolvedValueOnce({ data: { data: [] }, error: null });
    expect(await porta.agendamentosDaPasta(ID)).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("sem appointments.view é SEM_PERMISSAO; outra clínica é NAO_ENCONTRADO", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "ATTA-AUTH-0004", details: null, hint: null } });
    expect(await porta.agendamentosDaPasta(ID)).toMatchObject({ ok: false, error: { code: "SEM_PERMISSAO" } });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "ATTA-CORE-0005", details: "person_id", hint: null } });
    expect(await porta.agendamentosDaPasta(ID)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
  });
});

describe("porta real de Pacientes: filtros da lista (captura 11, #158)", () => {
  it("o filtro vai em p_filter na lista e na busca; os contadores vêm da primeira linha, contados antes do filtro", async () => {
    rpc.mockResolvedValueOnce({ data: [await linha()], error: null });
    const r = await porta.listar(undefined, "atendimento_hoje");
    expect(rpc).toHaveBeenLastCalledWith("patient_list", { p_limit: 50, p_filter: "atendimento_hoje" });
    expect(r.ok && r.data.contadores).toEqual({ outra_clinica: 1, atendimento_hoje: 2, arquivados: 0 });
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const vazia = await porta.listar(undefined, "arquivados");
    expect(vazia.ok && vazia.data.contadores).toBeNull(); // sem linha, a tela guarda os contadores que já tinha
    rpc.mockResolvedValueOnce({ data: [await linha()], error: null });
    await porta.buscar("juli", "outra_clinica");
    expect(rpc).toHaveBeenLastCalledWith("patient_search", { p_name: "juli", p_filter: "outra_clinica" });
  });

  it("a lista do filtro do cliente (schema.ts) é a mesma da porta", async () => {
    const { FILTROS } = await import("@/features/pacientes/schema");
    const { FILTROS_DA_LISTA } = await import("./porta");
    expect([...FILTROS]).toEqual([...FILTROS_DA_LISTA]);
  });
});
