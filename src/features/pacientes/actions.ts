"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaPacientes, type ConsultaDeCpf, type LinhaDePaciente, type PaginaDePacientes } from "@/server/pacientes/porta";
import { buscaSchema, cadastroSchema, cpfDaBuscaSchema, cursorSchema } from "./schema";

// Server actions da lista de Pacientes (POST; o termo da busca vai no corpo, nunca na URL). A sessão é a do painel: o
// proxy desvia quem não tem, e a porta real chama api.* com ela (a RLS e a função conferem tenant e permissão).
// Log só com o desfecho, sem nome, CPF nem contato.

export async function listarPacientes(apos?: unknown): Promise<Resultado<PaginaDePacientes>> {
  let cursor;
  if (apos !== undefined) {
    const dados = cursorSchema.safeParse(apos);
    if (!dados.success) return falhaDeValidacao(dados.error.issues);
    cursor = dados.data;
  }
  const resultado = await portaPacientes.listar(cursor);
  if (!resultado.ok) logger.warn("pacientes.lista_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarPacientes(entrada: unknown): Promise<Resultado<LinhaDePaciente[]>> {
  const dados = buscaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.buscar(dados.data.termo);
  if (!resultado.ok) logger.warn("pacientes.busca_falhou", { code: resultado.error.code });
  return resultado;
}

// --- Novo paciente: consulta na rede, vínculo e cadastro mínimo (PDD §10.1; simulador, capturas 15 a 18) -------------

export async function consultarCpfNaRede(entrada: unknown): Promise<Resultado<ConsultaDeCpf>> {
  const dados = cpfDaBuscaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.consultarCpf(dados.data.cpf);
  logger.info("pacientes.cpf_consultado", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

export async function vincularPacienteDaRede(entrada: unknown): Promise<Resultado<{ id: string; situacao: "vinculado" | "ja_paciente" }>> {
  const dados = cpfDaBuscaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.vincularPorCpf(dados.data.cpf);
  logger.info("pacientes.vinculo", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

export async function cadastrarPaciente(entrada: unknown): Promise<Resultado<{ id: string; reaproveitado: boolean }>> {
  const dados = cadastroSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const d = dados.data;
  const resultado = await portaPacientes.cadastrar({
    nomeCivil: d.nomeCivil,
    nomeSocial: d.nomeSocial,
    nascimento: d.nascimento,
    documento: d.documento,
    celular: d.celular,
    email: d.email,
  });
  logger.info("pacientes.cadastro", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}
