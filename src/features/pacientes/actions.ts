"use server";

import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { MOTIVOS_DE_DIVERGENCIA, portaPacientes, type AgendamentosDaPasta, type CartaoDaRede, type ConsultaDeCpf, type LinhaDePaciente, type PaginaDePacientes } from "@/server/pacientes/porta";
import { celularMascarado, emailMascarado } from "@/server/pacientes/real";
import { buscaSchema, cadastroSchema, cpfDaBuscaSchema, cursorSchema, filtroDaListaSchema } from "./schema";

// Server actions da lista de Pacientes (POST; o termo da busca vai no corpo, nunca na URL). A sessão é a do painel: o
// proxy desvia quem não tem, e a porta real chama api.* com ela (a RLS e a função conferem tenant e permissão).
// Log só com o desfecho, sem nome, CPF nem contato.

export async function listarPacientes(apos?: unknown, filtro?: unknown): Promise<Resultado<PaginaDePacientes>> {
  let cursor;
  if (apos !== undefined && apos !== null) {
    const dados = cursorSchema.safeParse(apos);
    if (!dados.success) return falhaDeValidacao(dados.error.issues);
    cursor = dados.data;
  }
  const lido = filtroDaListaSchema.optional().safeParse(filtro ?? undefined);
  if (!lido.success) return falhaDeValidacao(lido.error.issues);
  const resultado = await portaPacientes.listar(cursor, lido.data);
  if (!resultado.ok) logger.warn("pacientes.lista_falhou", { code: resultado.error.code });
  return resultado;
}

export async function buscarPacientes(entrada: unknown): Promise<Resultado<LinhaDePaciente[]>> {
  const dados = buscaSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.buscar(dados.data.termo, dados.data.filtro);
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

/**
 * Cartão do paciente que já é desta clínica, para o "já paciente" do Novo paciente (captura 16): a mesma leitura da Pasta
 * (patient_get, auditada), com o contato mascarado aqui no servidor (PDD §19.8) e sem nada de saúde.
 */
export async function cartaoDoPacienteDaClinica(entrada: unknown): Promise<Resultado<CartaoDaRede>> {
  const dados = z.object({ id: z.uuid() }).strict().safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaPacientes.obter(dados.data.id);
  if (!r.ok) return r;
  const f = r.data;
  const celular = celularMascarado(f.contato?.celular ?? null);
  const email = emailMascarado(f.contato?.email ?? null);
  return {
    ok: true,
    data: {
      id: f.id,
      nome: f.nome,
      nomeCivil: f.nomeCivil,
      nomeSocial: f.nomeSocial,
      nascimento: f.nascimento,
      identificacao: f.identificacao,
      incompleto: f.identificacao.tipo === "incompleto",
      contato: celular || email ? { celular, email } : null,
      selo: f.selo,
      respostasDeSaude: null,
    },
  };
}

/** "Algum dado não confere? Reportar à ATTA" do Novo paciente (RN-PAC-08): motivo da lista fechada, pelo CPF buscado. */
export async function reportarDivergenciaDaRede(entrada: unknown): Promise<Resultado<{ recebido: true }>> {
  const dados = cpfDaBuscaSchema.extend({ motivo: z.enum(MOTIVOS_DE_DIVERGENCIA) }).strict().safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.reportarDivergenciaPorCpf(dados.data.cpf, dados.data.motivo);
  logger.info("pacientes.reporte_enviado", { ok: resultado.ok, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

/** "Arquivar paciente" da Pasta (PLANO, decisão do dono de 20/11): só o gestor; o banco confere o papel e os agendamentos. */
export async function arquivarPaciente(entrada: unknown): Promise<Resultado<{ arquivado: boolean }>> {
  const dados = z.object({ id: z.uuid(), arquivar: z.boolean() }).strict().safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.arquivar(dados.data.id, dados.data.arquivar);
  logger.info("pacientes.arquivo", { ok: resultado.ok, arquivar: dados.data.arquivar, code: resultado.ok ? undefined : resultado.error.code });
  return resultado;
}

/** "Carregar mais" dos agendamentos da Pasta: a página seguinte pelo cursor do banco ("<instante>|<id>"). */
export async function maisAgendamentosDaPasta(entrada: unknown): Promise<Resultado<AgendamentosDaPasta>> {
  const dados = z.object({ id: z.uuid(), cursor: z.string().min(1).max(80) }).strict().safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const resultado = await portaPacientes.agendamentosDaPasta(dados.data.id, dados.data.cursor);
  if (!resultado.ok) logger.warn("pacientes.agendamentos_falhou", { code: resultado.error.code });
  return resultado;
}
