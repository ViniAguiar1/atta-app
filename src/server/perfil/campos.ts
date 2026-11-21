// Lista fechada dos campos da empresa do Perfil da Clínica (contrato do api.clinic_profile_set, #296). Fica num módulo
// próprio porque a porta.ts e a real.ts usam a lista, e a porta.ts importa a real.ts (um import de valor entre as duas
// fecharia o ciclo).
export const CAMPOS_DA_EMPRESA = [
  "trade_name",
  "legal_name",
  "cnpj",
  "tax_registration",
  "main_specialty",
  "address_cep",
  "address_street",
  "address_number",
  "address_complement",
  "address_city",
  "address_uf",
  "phone",
  "clinic_whatsapp",
  "commercial_email",
] as const;
export type CampoDaEmpresa = (typeof CAMPOS_DA_EMPRESA)[number];
