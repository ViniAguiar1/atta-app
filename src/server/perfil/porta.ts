import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaPerfilSimulada } from "./simulado";
import { portaPerfilVazia } from "./vazia";

// Contrato entre Configurações › Perfil da Clínica (MIG-42, Frontend; PDD v206 §10.4.1; simulador, captura 42) e o
// backend do Backend 1 (ADR 0001, §"Perfil da Clínica", fechado pelo Tech Lead em 21/11). Leitura: api.clinic_profile(),
// só ADMIN com aal2, conferido no banco. Escrita da empresa: api.clinic_profile_set(p_field, p_value), lista fechada e
// validação no banco, devolvendo saved_at e gravando tenant.profile_update só com o nome do campo. O gestor e o Responsável
// Técnico (dado pessoal, cifrado no servidor do Next) entram por api.clinic_responsible_set, no PR seguinte.
// Os nomes dos campos são os do contrato, para a porta real só repassar.
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

/** Gestor ou Responsável Técnico como a tela recebe: CPF, e-mail e WhatsApp só mascarados (ADR 0001). */
export type Responsavel = {
  nome: string | null;
  cpfMascarado: string | null;
  emailMascarado: string | null;
  whatsappMascarado: string | null;
};

export type PerfilDaClinica = {
  /** "Clínica desde" (platform.tenant.created_at) */
  desde: string | null;
  /** fuso da clínica (platform.tenant.timezone), para o horário do último salvamento */
  fuso: string;
  campos: Record<CampoDaEmpresa, string | null>;
  gestor: Responsavel | null;
  responsavelTecnico: (Responsavel & { mesmaPessoa: boolean; conselho: string | null; uf: string | null; registro: string | null }) | null;
  /** último salvamento de qualquer campo (o "salvo às" do topo, §10.4.1) */
  salvoEm: string | null;
  /** o que falta para consolidar documentos (missing_required do banco; a regra é do banco) */
  faltando: string[];
};

export type PortaPerfil = {
  /** null: sem leitura real ainda (produção até o backend do Backend 1); a tela mostra o estado vazio do design. */
  perfil(): Promise<Resultado<PerfilDaClinica | null>>;
  /** Um campo da empresa, já normalizado (só dígitos no CNPJ, no CEP e nos telefones). VALIDACAO: o banco recusou. */
  salvarCampo(campo: CampoDaEmpresa, valor: string | null): Promise<Resultado<{ salvoEm: string }>>;
};

/**
 * Escolha da porta, só aqui (regra de stage do Tech Lead Frontend, o modelo do src/server/agenda): sem o backend, a
 * produção usa a vazia (estado vazio do design) e a prévia, o local e o CI usam a simulada, só com dado fictício.
 */
export function escolherPortaPerfil(ambiente = process.env.VERCEL_ENV): PortaPerfil {
  return ambiente === "production" ? portaPerfilVazia : portaPerfilSimulada;
}

export const portaPerfil: PortaPerfil = escolherPortaPerfil();
