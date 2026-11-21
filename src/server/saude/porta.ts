import "server-only";
import type { Resultado } from "@/lib/errors";
import type { FormularioDoPaciente, LeituraDoFormulario, Resposta } from "@/lib/saude/schema";
import { portaSaudeIndisponivel } from "./indisponivel";
import { portaSaudeSimulada } from "./simulado";

// Contrato do Formulário de Saúde (MIG-52) entre as telas e o servidor do MIG-22 (Backend 3), aprovado pelo Tech Lead
// (migracao/desenho/mig-52-formulario-contrato.md). A real (MIG-22) resolve tudo pelo hash do segredo do grant (ADR 0004;
// nenhum id vem do navegador), cifra cada resposta com getCofre('health') antes do banco e decifra só no servidor
// (ADR 0002). Gestor e Colaborador não têm porta: não há caminho do painel até o conteúdo (RN-FSA-01).
// Nunca resposta de saúde em URL, log ou print.

export type { FormularioDoPaciente, LeituraDoFormulario, Pergunta, Resposta, RespostaAnterior, Valor } from "@/lib/saude/schema";

/** Porta do paciente, no check-in (grant patient_checkin). */
export type PortaFormularioPaciente = {
  /** O formulário único do atendimento (§10.2.1), as respostas anteriores do CPF e o rascunho salvo (retomada, §15.4). */
  carregar(hashDoGrant: Buffer): Promise<Resultado<FormularioDoPaciente>>;
  /** Salvamento contínuo, por pergunta (§11.5, §26.2). VALIDACAO: valor fora do tipo da pergunta. */
  salvarResposta(hashDoGrant: Buffer, resposta: Resposta): Promise<Resultado<{ salvoEm: string }>>;
  /**
   * "Declaro" (§11.7): só com todas respondidas ou recusadas (CONFLITO, se faltar). Recusa de obrigatória encerra o
   * check-in e cancela o atendimento (RN-FSA-12): quem decide é o banco, que devolve 'cancelado'.
   */
  declarar(hashDoGrant: Buffer): Promise<Resultado<{ status: "ok" } | { status: "cancelado" }>>;
};

/**
 * A única leitura do profissional (Boarding Check, grant professional_boarding): só leitura, e cada abertura grava
 * health.read na trilha (no servidor). Quem chama é a porta do Boarding Check (MIG-23, Backend 6); não há segunda leitura.
 */
export type PortaLeituraDoProfissional = {
  lerParaBoarding(hashDoGrant: Buffer): Promise<Resultado<LeituraDoFormulario>>;
};

export type PortaSaude = PortaFormularioPaciente & PortaLeituraDoProfissional;

/**
 * Escolha da porta, só aqui (regra de stage do Tech Lead Frontend): sem o MIG-22, a produção responde INDISPONIVEL em
 * tudo, para dado de saúde simulado nunca aparecer na produção (e /ficha/** dá 404 lá pelo moduloDisponivel). A prévia,
 * o local e o CI usam a simulada, só com perguntas e respostas inventadas. Com o MIG-22, a real vale em todos.
 */
export function escolherPortaSaude(ambiente = process.env.VERCEL_ENV): PortaSaude {
  return ambiente === "production" ? portaSaudeIndisponivel : portaSaudeSimulada;
}

export const portaSaude: PortaSaude = escolherPortaSaude();
