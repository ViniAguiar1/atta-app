import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaBoardingSimulada } from "./simulado";
// A porta real (./real.ts, MIG-23 parte 3) entra no lugar desta no PR seguinte, junto do seed do CI e dos e2e.

// Contrato entre as telas do Boarding Check (MIG-53, Frontend 6) e o domínio (MIG-23, Backend 3; transições do
// Backend 2). PDD v206 §10.2.3, RN-FIC-07 e §13.4; ADR 0004 §3. O profissional não tem login: o link do WhatsApp
// (/b/<segredo>) vira, com o PIN certo, o grant `professional_boarding` no cookie atta_grant. Nenhum id vem do
// navegador: atendimento, profissional e clínica saem do grant. A porta só recebe hashes (sha256): o segredo da sessão
// é gerado pelo app em `gravarGrant` (src/server/grant/cookie.ts) e nunca sai do cookie.
// Limites do PIN e validade do link são do servidor (private.grant_is_valid): a tela não conta tentativas.

/** Espelha `api.boarding_confirm_pin` (Backend 3). `indisponivel` é a mesma resposta para link desconhecido,
 * vencido (8 h do envio), revogado (10 erros), concluído ou cancelado: sem oráculo. */
export type ConferenciaDoPin =
  | { status: "ok" }
  | { status: "pin_incorreto" }
  | { status: "bloqueado"; bloqueadoAte: string } // ISO 8601; 5 erros seguidos = 15 min
  | { status: "indisponivel" };

/** Resumo do atendimento do topo do Boarding Check (§10.2.3: identificação, tipo de atendimento, histórico de
 * comparecimento). Campos provisórios: o Backend 3 fecha a forma com a tabela de saúde e a agenda na main. */
export type ResumoDoAtendimento = {
  clinica: string;
  paciente: { nome: string; idade: number | null }; // sem data de nascimento no cadastro: nula
  horario: string; // "HH:MM", já no fuso da clínica (calculado no servidor)
  tipoDeAtendimento: string;
  comparecimento: { atendimentos: number; ausencias: number };
};

export type PortaBoardingCheck = {
  /** PIN certo: na mesma transação, o segredo do link deixa de valer e o grant passa a ter `hashDaSessao`. */
  confirmarPin(hashDoLink: Buffer, pin: string, hashDaSessao: Buffer): Promise<Resultado<ConferenciaDoPin>>;
  /** `api.boarding_open`: resumo e Formulário de Saúde só leitura (MIG-53b). Cada abertura audita boarding.open e
   * health.read e passa o atendimento a Em atendimento. NAO_AUTENTICADO: grant inválido. */
  abrir(hashDaSessao: Buffer): Promise<Resultado<ResumoDoAtendimento>>;
  /** `api.boarding_complete` (Backend 2): Concluído e grant revogado. CONFLITO: a trava do §10.2.3 não deixa. */
  concluir(hashDaSessao: Buffer): Promise<Resultado<{ concluidoEm: string }>>;
};

export const portaBoarding: PortaBoardingCheck = portaBoardingSimulada;
