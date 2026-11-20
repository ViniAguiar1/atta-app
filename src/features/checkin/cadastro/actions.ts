"use server";

import { z } from "zod";
import { falhaDeValidacao, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { portaCadastro } from "@/server/cadastro/porta";
import { dadosSchema, type DadosDoPaciente } from "./schema";

// Server actions da "Confirme Seus Dados" (POST; dado pessoal só no corpo). O paciente vem do grant no servidor.
// Log só com o desfecho, sem nenhum campo do cadastro.

export async function carregarDados(): Promise<Resultado<DadosDoPaciente>> {
  return portaCadastro.carregar();
}

export async function salvarDados(entrada: unknown): Promise<Resultado<{ salvoEm: string }>> {
  const dados = dadosSchema.safeParse(entrada);
  if (!dados.success) return falhaDeValidacao(dados.error.issues);
  const r = await portaCadastro.salvar(dados.data);
  logger.info("cadastro.salvo", { ok: r.ok, code: r.ok ? undefined : r.error.code });
  return r;
}

export async function buscarCep(entrada: unknown) {
  const cep = z.string().regex(/^\d{8}$/).safeParse(entrada);
  if (!cep.success) return falhaDeValidacao(cep.error.issues);
  return portaCadastro.buscarCep(cep.data);
}
