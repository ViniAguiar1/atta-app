"use server";

import { z } from "zod";
import { falha, falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaCadastro } from "@/server/cadastro/porta";
import { checkinNoAr, FORA_DO_AR } from "@/server/checkin/disponivel";
import { lerSessaoSimulada } from "@/server/checkin/sessao-simulada";
import { dadosSchema, type DadosDoPaciente } from "./schema";

// Server actions da "Confirme Seus Dados" (POST; dado pessoal só no corpo). O paciente vem do grant no servidor.
// Toda action confere a sessão antes de qualquer coisa, inclusive o CEP (ADR 0004 §3: sem isso, vira serviço aberto).
// Hoje a sessão é a simulada; com o MIG-13a, a conferência passa a ser a de src/server/grant/politica.ts.
// Na produção, com a porta simulada, recusam como rota inexistente (checkinNoAr). Log só com o desfecho, sem nenhum
// campo do cadastro.

const SEM_SESSAO = falha("NAO_AUTENTICADO", "Sem sessão do check-in.");
const temSessao = async () => Boolean(await lerSessaoSimulada());

export async function carregarDados(): Promise<Resultado<DadosDoPaciente>> {
  if (!checkinNoAr()) return FORA_DO_AR;
  if (!(await temSessao())) return SEM_SESSAO;
  return portaCadastro.carregar();
}

export async function salvarDados(entrada: unknown): Promise<Resultado<{ salvoEm: string }>> {
  if (!checkinNoAr()) return FORA_DO_AR;
  if (!(await temSessao())) return SEM_SESSAO;
  const dados = dadosSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaCadastro.salvar(dados.data);
  logger.info("cadastro.salvo", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function buscarCep(entrada: unknown) {
  if (!checkinNoAr()) return FORA_DO_AR;
  if (!(await temSessao())) return SEM_SESSAO;
  const cep = z.string().regex(/^\d{8}$/).safeParse(entrada);
  if (!cep.success) return falhaDeValidacao(cep.error.issues);
  return portaCadastro.buscarCep(cep.data);
}
