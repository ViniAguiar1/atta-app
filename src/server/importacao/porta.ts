import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaImportacaoSimulada } from "./simulado";
import { portaImportacaoVazia } from "./vazia";

/**
 * Importação da base de pacientes (PDD v206 §10.1, "Importação da base de pacientes"; MIG-34, Integrações).
 * Contrato combinado com o Frontend 3 (tela da captura 48) e o Tech Lead (21/11):
 * - só a planilha modelo .xlsx (aba "Pacientes", 5 colunas), até 20 MB; fora do modelo é recusada inteira;
 * - declaração do gestor antes do envio; envio assinado direto no bucket privado "importacoes";
 * - a prévia não grava nada; depois de confirmar, importa por linha e não se desfaz ("o envio do arquivo é a
 *   autorização"); o processamento leva até 3 dias úteis;
 * - CPF novo fica só na base da clínica até o primeiro check-in; CPF que já está na rede só preenche campo vazio;
 * - só ADMIN, conferido no banco. Nada de conteúdo de linha na resposta: só o número da linha e o código.
 */

export type StatusImportacao = "recebida" | "processando" | "concluida" | "recusada";

/** Por que a linha não entra (PDD §10.1: nome completo e CPF são obrigatórios; sem CPF não importa). */
export type MotivoLinha =
  | "nome_ausente"
  | "nome_invalido" // com menos de 2 ou mais de 200 caracteres
  | "cpf_ausente"
  | "cpf_invalido"
  | "cpf_repetido_na_planilha" // o mesmo CPF de novo, com os mesmos dados: fica a primeira linha
  | "repetido_diferente" // o mesmo CPF com dados diferentes: nenhuma das linhas entra
  | "ja_na_clinica"; // o CPF já é paciente desta clínica (só no resultado; a prévia não consulta o banco)

/** Campo opcional que veio fora da forma e entra em branco (PDD §10.1: "se faltarem, entram em branco"). */
export type CampoDescartado = "nascimento" | "celular" | "email";

export type ResumoImportacao = { imported: number; linked_to_network: number; skipped: number };

export type SituacaoImportacao = {
  subscription_since: string; // AAAA-MM-DD
  quota_until: string; // fim dos 3 primeiros meses da assinatura
  included: { used: 0 | 1 | 2; total: 2 }; // 1 importação da base e 1 complementar incluídas
  price_per_import_cents: number;
  full_import_price_cents: number;
  full_import_contracted: boolean;
  imports: {
    id: string;
    status: StatusImportacao;
    sent_at: string;
    due_at: string;
    summary: ResumoImportacao | null;
  }[];
};

export type PreviaImportacao = {
  total: number;
  valid: number;
  errors: { line: number; code: MotivoLinha }[];
  blanked: { line: number; field: CampoDescartado }[];
};

export type ResultadoImportacao = {
  imported: number; // CPF novo, provisório na base da clínica
  linked_to_network: number; // CPF já na rede, vinculado com origem "importação"
  already_in_clinic: number;
  skipped: { line: number; code: MotivoLinha }[];
  blanked: number;
};

export type PortaImportacao = {
  situacao(): Promise<Resultado<SituacaoImportacao>>;
  /** URL de vida curta da planilha modelo (.xlsx, abas "Leia primeiro" e "Pacientes"). */
  urlDoModelo(): Promise<Resultado<{ url: string }>>;
  /** Grava a declaração (texto e versão, data e hora, IP, usuário) e libera o envio. */
  declarar(versao: string): Promise<Resultado<{ declaration_id: string }>>;
  /** Cria a importação e a URL assinada de uso único (só .xlsx, até 20 MB). */
  iniciarEnvio(
    declarationId: string,
    tamanhoBytes: number,
  ): Promise<Resultado<{ import_id: string; upload_url: string }>>;
  /** Lê e valida o arquivo enviado, sem gravar. Fora do modelo: VALIDACAO no campo "arquivo". */
  previa(importId: string): Promise<Resultado<PreviaImportacao>>;
  /** Importa por linha; não se desfaz. */
  confirmar(importId: string): Promise<Resultado<{ status: "processando"; due_at: string }>>;
  resultado(importId: string): Promise<Resultado<ResultadoImportacao>>;
};

/**
 * Escolha da porta, só aqui (o modelo do src/server/agenda): sem a real ainda, a produção usa a vazia (tudo
 * INDISPONIVEL, e a tela esconde a seção) e a prévia, o local e o CI usam a simulada, só com dado fictício.
 */
export function escolherPortaImportacao(ambiente = process.env.VERCEL_ENV): PortaImportacao {
  return ambiente === "production" ? portaImportacaoVazia : portaImportacaoSimulada;
}

export const portaImportacao: PortaImportacao = escolherPortaImportacao();
