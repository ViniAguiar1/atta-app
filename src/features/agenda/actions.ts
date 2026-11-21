"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaAgenda } from "@/server/agenda/porta";
import { portaNovoAgendamento } from "@/server/agenda/novo/porta";
import {
  buscaDoPacienteSchema,
  filtroDosHorariosSchema,
  type Duracoes,
  type HorariosLivres,
  type PacienteDoModal,
  type ProfissionalDoModal,
} from "./novoAgendamento";
import {
  entradaDaAcaoSchema,
  filtroDoDiaSchema,
  filtroDoPeriodoSchema,
  filtroDosConcluidosSchema,
  termoPronto,
  type DiaDaAgenda,
  type ListaDaAgenda,
  type ResumoDaAgenda,
} from "./schema";

// Server actions da Agenda (POST): a busca por nome ou CPF vai no corpo, nunca na URL (ADR 0001 §5). Quem autoriza é
// a sessão do usuário na porta real (RLS e has_permission('appointments','view')). Log só com o desfecho, sem a busca.

export async function buscarNoDia(entrada: unknown): Promise<Resultado<DiaDaAgenda>> {
  const filtro = filtroDoDiaSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.dia(filtro.data);
  if (!resultado.ok) logger.warn("agenda.dia_falhou", { code: resultado.error.code });
  return resultado;
}

export async function resumirDia(): Promise<Resultado<ResumoDaAgenda>> {
  const resultado = await portaAgenda.resumo({});
  if (!resultado.ok) logger.warn("agenda.resumo_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarNoPeriodo(entrada: unknown): Promise<Resultado<ListaDaAgenda>> {
  const filtro = filtroDoPeriodoSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.periodo(filtro.data);
  if (!resultado.ok) logger.warn("agenda.periodo_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarConcluidos(entrada: unknown): Promise<Resultado<ListaDaAgenda>> {
  const filtro = filtroDosConcluidosSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaAgenda.concluidos(filtro.data);
  if (!resultado.ok) logger.warn("agenda.concluidos_falhou", { code: resultado.error.code });
  return resultado;
}

/** Ação da linha (PDD §10.2.2): Zod .strict na borda; o banco confere estado e permissão. Log só com a ação e o code. */
export async function executarAcao(entrada: unknown): Promise<Resultado<null>> {
  const lida = entradaDaAcaoSchema.safeParse(entrada);
  if (!lida.success) return falhaDeValidacao(lida.error.issues);
  const resultado = await portaAgenda.acao(lida.data);
  if (!resultado.ok) logger.warn("agenda.acao_falhou", { acao: lida.data.acao, code: resultado.error.code });
  return resultado;
}

// Modal "Agendar Novo Atendimento" (captura 34; contrato mig-41-novo-agendamento, itens 1 a 5). A busca do paciente vai
// no corpo, como a do dia; o CPF inteiro vira HMAC na porta de Pacientes. Log só com o desfecho, nunca o termo.

export async function profissionaisDoModal(): Promise<Resultado<ProfissionalDoModal[]>> {
  const resultado = await portaNovoAgendamento.profissionais();
  if (!resultado.ok) logger.warn("agenda.novo.profissionais_falhou", { code: resultado.error.code });
  return resultado;
}

export async function duracoesDoModal(): Promise<Resultado<Duracoes>> {
  const resultado = await portaNovoAgendamento.duracoes();
  if (!resultado.ok) logger.warn("agenda.novo.duracoes_falhou", { code: resultado.error.code });
  return resultado;
}

export async function horariosLivresDoModal(entrada: unknown): Promise<Resultado<HorariosLivres>> {
  const filtro = filtroDosHorariosSchema.safeParse(entrada);
  if (!filtro.success) return falhaDeValidacao(filtro.error.issues);
  const resultado = await portaNovoAgendamento.horariosLivres(filtro.data);
  if (!resultado.ok) logger.warn("agenda.novo.horarios_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarPacienteDoModal(entrada: unknown): Promise<Resultado<PacienteDoModal[]>> {
  const lida = buscaDoPacienteSchema.safeParse(entrada);
  if (!lida.success || !termoPronto(lida.data.termo)) return falhaDeValidacao(lida.success ? [] : lida.error.issues);
  const resultado = await portaNovoAgendamento.buscarPaciente(lida.data.termo);
  if (!resultado.ok) logger.warn("agenda.novo.busca_falhou", { code: resultado.error.code });
  return resultado;
}
