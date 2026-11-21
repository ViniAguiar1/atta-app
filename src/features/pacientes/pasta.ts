import "server-only";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { portaPacientes, type AgendamentosDaPasta, type FichaDoPaciente } from "@/server/pacientes/porta";

/**
 * Pasta do Paciente (simulador, captura 12): a ficha inteira, com o contato aberto, porque a Pasta é a leitura auditada
 * de dado pessoal (patient_get grava patient.read). Leitura só do servidor, na página; não é server action, para o
 * contato inteiro não ter outra porta além da tela. Só o id na URL, nunca nome ou CPF. Nada de saúde.
 */
export async function abrirPasta(id: unknown): Promise<Resultado<FichaDoPaciente>> {
  const dados = z.uuid().safeParse(id);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.obter(dados.data);
  logger.info("pacientes.pasta_aberta", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

/**
 * "Agendamentos e documentos" da Pasta (simulador, capturas 13 e 14; api.patient_folder_appointments, #227): a primeira
 * página, os totais do resumo e o fuso da clínica. Sem appointments.view volta SEM_PERMISSAO, e a seção não aparece.
 */
export async function abrirAgendamentos(id: unknown): Promise<Resultado<AgendamentosDaPasta>> {
  const dados = z.uuid().safeParse(id);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.agendamentosDaPasta(dados.data);
  if (!resultado.ok) logger.warn("pacientes.agendamentos_falhou", { code: resultado.error.code });
  return resultado;
}
