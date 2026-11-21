import { beforeEach, describe, expect, it, vi } from "vitest";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING, CI_TEST_RNE_PEPPER_HEX } from "../../../tests/fixtures/cofre-ci";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { cpfHmacWith } from "@/server/crypto/cpf";
import { columnAad, open } from "@/server/crypto/envelope";
import { deBytea, selarContato } from "./contato";

// Novo paciente na porta real (#150 do Backend 2): consulta e vínculo pelo HMAC do CPF, cadastro com um envelope só para
// a linha. Cliente do Supabase simulado e KEK de teste. Dado fictício: CPF gerado, nome inventado.
vi.stubEnv("ATTA_REDE_CHAVE_MESTRA", CI_TEST_KEYRING);
vi.stubEnv("ATTA_CPF_PEPPER", CI_TEST_CPF_PEPPER_HEX);
vi.stubEnv("ATTA_RNE_PEPPER", CI_TEST_RNE_PEPPER_HEX);

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  criarClienteServidor: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { tenant_id: "eeee0000-0000-4000-8000-000000000001" } } }) },
    schema: () => ({ rpc }),
  }),
}));
const { portaPacientesReal: porta } = await import("./real");
const cofre = new MasterKeyCofre(parseKeyring(CI_TEST_KEYRING));
const CPF = "52998224725";
const HMAC = `\\x${cpfHmacWith(Buffer.from(CI_TEST_CPF_PEPPER_HEX, "hex"), CPF).toString("hex")}`;
const PESSOA = "eeee0000-0000-4000-8000-000000000101";

beforeEach(() => rpc.mockReset());

describe("consultar CPF na rede", () => {
  it("manda só o HMAC; não encontrado e já paciente", async () => {
    rpc.mockResolvedValueOnce({ data: { status: "nao_encontrado" }, error: null });
    expect(await porta.consultarCpf("529.982.247-25")).toEqual({ ok: true, data: { situacao: "nao_encontrado" } });
    expect(rpc).toHaveBeenCalledWith("patient_lookup_by_cpf", { p_cpf_hmac: HMAC });
    rpc.mockResolvedValueOnce({ data: { status: "ja_paciente", person_id: PESSOA }, error: null });
    expect(await porta.consultarCpf(CPF)).toEqual({ ok: true, data: { situacao: "ja_paciente", id: PESSOA } });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(CPF);
  });

  it("na rede: o cartão sai com o contato mascarado, sem bytes cifrados nem a chave (Segurança, #150)", async () => {
    const contato = await selarContato({ celular: "11987654321", email: "juliana.prates@exemplo.test" }, { tenant: "", tabela: "network.person" }, PESSOA, cofre);
    rpc.mockResolvedValueOnce({
      data: {
        status: "na_rede",
        card: {
          person_id: PESSOA, full_name: "Juliana Prates", social_name: null, birth_date: "1990-09-17", cpf_masked: "···.···.247-25",
          is_incomplete: false, is_verified: true, verified_until: "2027-06-30T00:00:00Z", ...contato, envelope_id: PESSOA,
          health_forms_count: 2,
        },
      },
      error: null,
    });
    const r = await porta.consultarCpf(CPF);
    expect(r.ok && r.data).toEqual({
      situacao: "na_rede",
      cartao: {
        id: PESSOA, nome: "Juliana Prates", nomeCivil: "Juliana Prates", nomeSocial: null, nascimento: "1990-09-17",
        identificacao: { tipo: "cpf", mascarado: "···.···.247-25" }, incompleto: false,
        contato: { celular: "(11) ·····-4321", email: "ju···@exemplo.test" }, selo: { validoAte: "2027-06-30T00:00:00Z" },
        respostasDeSaude: 2,
      },
    });
    const texto = JSON.stringify(r);
    expect(texto).not.toMatch(/98765|juliana\.prates@|\\\\x|dek/);
  });

  it("CPF inválido é VALIDACAO sem ir ao banco; o limite do banco vira LIMITE", async () => {
    expect((await porta.consultarCpf("111.111.111-11")).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: { code: "54000", message: "ATTA-IN-0005", details: null, hint: null } });
    expect(await porta.consultarCpf(CPF)).toMatchObject({ ok: false, error: { code: "LIMITE" } });
  });
});

describe("vincular por CPF", () => {
  it("vinculado, já paciente e fora da rede", async () => {
    rpc.mockResolvedValueOnce({ data: { status: "vinculado", person_id: PESSOA, network_access: "granted" }, error: null });
    expect(await porta.vincularPorCpf(CPF)).toEqual({ ok: true, data: { id: PESSOA, situacao: "vinculado" } });
    expect(rpc).toHaveBeenCalledWith("patient_link_by_cpf", { p_cpf_hmac: HMAC });
    rpc.mockResolvedValueOnce({ data: { status: "ja_paciente", person_id: PESSOA, network_access: null }, error: null });
    expect(await porta.vincularPorCpf(CPF)).toEqual({ ok: true, data: { id: PESSOA, situacao: "ja_paciente" } });
    rpc.mockResolvedValueOnce({ data: { status: "nao_encontrado", person_id: null, network_access: null }, error: null });
    expect(await porta.vincularPorCpf(CPF)).toMatchObject({ ok: false, error: { code: "NAO_ENCONTRADO" } });
  });
});

describe("cadastrar (primeira vez na rede)", () => {
  it("CPF só como HMAC e máscara; cpf_enc e contato num envelope só, que abre pela AAD de cada coluna", async () => {
    rpc.mockImplementationOnce(async (_f, args) => ({ data: [{ person_id: args.p_id, reused: false }], error: null }));
    const r = await porta.cadastrar({
      nomeCivil: "Juliana Prates", nomeSocial: null, nascimento: "1990-09-17",
      documento: { tipo: "cpf", numero: CPF }, celular: "(11) 98765-4321", email: "Juliana.Prates@Exemplo.test",
    });
    expect(r.ok).toBe(true);
    const [nome, args] = rpc.mock.calls[0]!;
    expect(nome).toBe("patient_register");
    expect(args).toMatchObject({ p_full_name: "Juliana Prates", p_birth_date: "1990-09-17", p_cpf_hmac: HMAC, p_cpf_masked: "···.···.247-25", p_is_incomplete: false });
    expect(JSON.stringify(args)).not.toContain(CPF);
    const dek = await cofre.unwrapDataKey(
      { kekVersion: args.p_kek_version, blob: deBytea(args.p_dek_wrapped) },
      { tenant_id: "", table: "network.person", column: "dek", id: args.p_id },
    );
    const abrir = (v: string, col: string) => open(deBytea(v), dek, columnAad("", "network.person", col, args.p_id)).toString("utf8");
    expect(abrir(args.p_cpf_enc, "cpf_enc")).toBe(CPF);
    expect(abrir(args.p_phone_enc, "phone_enc")).toBe("11987654321");
    expect(abrir(args.p_email_enc, "email_enc")).toBe("juliana.prates@exemplo.test");
  });

  it("estrangeiro: RNE pelo HMAC do pepper do RNE, cadastro marcado como incompleto", async () => {
    rpc.mockImplementationOnce(async (_f, args) => ({ data: [{ person_id: args.p_id, reused: false }], error: null }));
    await porta.cadastrar({
      nomeCivil: "Lucas Pereira", nomeSocial: null, nascimento: null,
      documento: { tipo: "estrangeiro", especie: "rne", numero: "V123456A" }, celular: "11987654321", email: null,
    });
    const args = rpc.mock.calls[0]![1];
    expect(args).toMatchObject({ p_foreign_doc_type: "rne", p_is_incomplete: true });
    expect(args.p_foreign_doc_hmac).toMatch(/^\\x[0-9a-f]{64}$/);
    expect(args.p_cpf_hmac).toBeUndefined();
    expect(JSON.stringify(args)).not.toContain("V123456A");
  });

  it("já cadastrado nesta clínica vira CONFLITO", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "23505", message: "ATTA-IN-0002", details: "cpf", hint: null } });
    const r = await porta.cadastrar({
      nomeCivil: "Juliana Prates", nomeSocial: null, nascimento: null, documento: { tipo: "cpf", numero: CPF }, celular: "11987654321", email: null,
    });
    expect(r).toMatchObject({ ok: false, error: { code: "CONFLITO", reason: "ATTA-IN-0002:cpf" } });
  });
});
