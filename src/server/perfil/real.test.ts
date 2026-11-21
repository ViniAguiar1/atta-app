import { describe, expect, it, vi } from "vitest";
import { criarPortaPerfilReal, type ClienteDoPerfil } from "./real";

// Porta real contra um cliente falso, no formato do api.clinic_profile (#296). Só dado fictício: CNPJ gerado, nomes
// inventados, máscaras como o servidor grava. O e2e prova contra o banco local.
const perfilDoBanco = {
  created_at: "2026-11-20T12:00:00+00:00",
  timezone: "America/Sao_Paulo",
  saved_at: "2026-11-21T14:00:00+00:00",
  fields: {
    trade_name: "Clínica Alfa Estética",
    legal_name: "Alfa Serviços de Estética Ltda.",
    cnpj: "63049587000143",
    tax_registration: null,
    main_specialty: "Dermatologia",
    address_cep: "01001000",
    address_street: "Rua Inventada",
    address_number: "100",
    address_complement: null,
    address_city: "São Paulo",
    address_uf: "SP",
    phone: null,
    clinic_whatsapp: "11990010099",
    commercial_email: "contato@exemplo.test",
  },
  protected_fields: ["legal_name", "cnpj"],
  manager: { full_name: "Gestora Fictícia", cpf_masked: "···.···.938-60", email_masked: "g•••@exemplo.test", whatsapp_masked: "(11) •••••-0099" },
  technical_lead: { same_as_manager: true, full_name: "Gestora Fictícia", cpf_masked: "···.···.938-60", council: "crm", council_uf: "SP", council_number: "999905" },
  missing_required: ["address_complement"],
};

function clienteFalso(resposta: { data: unknown; error: unknown }) {
  const rpc = vi.fn<(fn: string, args?: Record<string, unknown>) => Promise<typeof resposta>>(async () => resposta);
  const cliente = { schema: () => ({ rpc }) } as unknown as ClienteDoPerfil;
  return { rpc, porta: criarPortaPerfilReal(async () => cliente) };
}

describe("porta real do Perfil da Clínica", () => {
  it("lê o perfil no tipo da tela, com o RT 'mesma pessoa' e só máscaras", async () => {
    const { rpc, porta } = clienteFalso({ data: perfilDoBanco, error: null });
    const r = await porta.perfil();
    expect(rpc).toHaveBeenCalledWith("clinic_profile");
    expect(r).toMatchObject({
      ok: true,
      data: {
        fuso: "America/Sao_Paulo",
        salvoEm: "2026-11-21T14:00:00+00:00",
        campos: { cnpj: "63049587000143" },
        gestor: { nome: "Gestora Fictícia", cpfMascarado: "···.···.938-60" },
        responsavelTecnico: { mesmaPessoa: true, conselho: "crm", uf: "SP", registro: "999905", emailMascarado: null },
        faltando: ["address_complement"],
      },
    });
  });

  it("sem responsáveis, devolve null nos dois", async () => {
    const { porta } = clienteFalso({ data: { ...perfilDoBanco, manager: null, technical_lead: null }, error: null });
    const r = await porta.perfil();
    expect(r.ok && r.data?.gestor).toBeNull();
    expect(r.ok && r.data?.responsavelTecnico).toBeNull();
  });

  it("resposta fora do contrato vira INTERNO, sem o corpo no log", async () => {
    const { porta } = clienteFalso({ data: { fields: {} }, error: null });
    expect(await porta.perfil()).toMatchObject({ ok: false, error: { code: "INTERNO" } });
  });

  it("grava um campo pelo clinic_profile_set e devolve o saved_at; vazio vai como '' (o banco decide)", async () => {
    const { rpc, porta } = clienteFalso({ data: "2026-11-21T14:05:00+00:00", error: null });
    expect(await porta.salvarCampo("tax_registration", "123456")).toEqual({ ok: true, data: { salvoEm: "2026-11-21T14:05:00+00:00" } });
    expect(rpc).toHaveBeenCalledWith("clinic_profile_set", { p_field: "tax_registration", p_value: "123456" });
    await porta.salvarCampo("phone", null);
    expect(rpc).toHaveBeenLastCalledWith("clinic_profile_set", { p_field: "phone", p_value: "" });
  });

  it("o campo protegido volta como CONFLITO com o reason do banco", async () => {
    const { porta } = clienteFalso({
      data: null,
      error: { code: "P0001", message: "ATTA-IN-0003", details: "protected_field", hint: null },
    });
    expect(await porta.salvarCampo("cnpj", "41827365000171")).toMatchObject({
      ok: false,
      error: { code: "CONFLITO", reason: "ATTA-IN-0003:protected_field" },
    });
  });
});
