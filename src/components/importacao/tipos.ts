import type { Resultado } from "@/lib/errors";

// Cópia do contrato da PortaImportacao (MIG-34), combinado com a Integrações e aprovado pelo Tech Lead (21/11). A porta é
// da Integrações e entra no PR dela, em src/server/importacao/porta.ts; quando entrar, este arquivo sai e a tela importa
// os tipos de lá. Não mude aqui sem mudar lá.
export type StatusImportacao = "recebida" | "processando" | "concluida" | "recusada";
export type MotivoLinha = "nome_ausente" | "nome_invalido" | "cpf_ausente" | "cpf_invalido" | "cpf_repetido_na_planilha" | "repetido_diferente" | "ja_na_clinica";
export type CampoDescartado = "nascimento" | "celular" | "email";

export type SituacaoDaImportacao = {
  subscription_since: string;
  quota_until: string;
  included: { used: 0 | 1 | 2; total: 2 };
  price_per_import_cents: number;
  full_import_price_cents: number;
  full_import_contracted: boolean;
  imports: {
    id: string;
    status: StatusImportacao;
    sent_at: string;
    due_at: string;
    summary: { imported: number; linked_to_network: number; skipped: number } | null;
  }[];
};

export type PreviaDaImportacao = {
  total: number;
  valid: number;
  errors: { line: number; code: MotivoLinha }[];
  blanked: { line: number; field: CampoDescartado }[];
};

export type PortaImportacao = {
  situacao(): Promise<Resultado<SituacaoDaImportacao>>;
  urlDoModelo(): Promise<Resultado<{ url: string }>>;
  declarar(versao: string): Promise<Resultado<{ declaration_id: string }>>;
  iniciarEnvio(declarationId: string, tamanhoBytes: number): Promise<Resultado<{ import_id: string; upload_url: string }>>;
  previa(importId: string): Promise<Resultado<PreviaDaImportacao>>;
  confirmar(importId: string): Promise<Resultado<{ status: "processando"; due_at: string }>>;
  resultado(importId: string): Promise<
    Resultado<{ imported: number; linked_to_network: number; already_in_clinic: number; skipped: { line: number; code: MotivoLinha }[]; blanked: number }>
  >;
};
