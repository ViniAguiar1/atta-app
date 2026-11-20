/**
 * Verificação pública do Código ATTA (MIG-24; PDD v206 §18.6 e §10.3.3; ADR 0006 §6 do atta-platform).
 * A resposta tem exatamente 8 chaves, sem conteúdo nem dado pessoal. Código inexistente e malformado dão a mesma
 * resposta (exists = false, resto nulo): a rota não vira oráculo.
 *
 * Ordem: (1) limite de 30 por minuto por IP, contado antes de tudo, inclusive para código malformado; (2) normaliza o
 * que a pessoa digitou (normalizeAttaCode: minúscula, espaço, sem hífen); (3) só então o banco (api.atta_code_verify,
 * só service_role), que grava a consulta na trilha.
 * Usado pela rota GET /public/v1/verificar/[codigo] e pela página /verificar (Frontend, MIG-54).
 */
import "server-only";
import { isIP } from "node:net";
import { z } from "zod";
import { normalizeAttaCode } from "@/lib/atta-sign/attasign";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { ipDoCliente } from "@/lib/http/correlacao";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { type ClienteDoLimite, consumirLimite, LIMITES } from "@/server/limite";

export const ESTADOS_PUBLICOS = ["pre_assinado", "assinado_definitivo", "cancelado", "substituido", "recusado"] as const;

export const respostaVerificacaoSchema = z
  .object({
    exists: z.boolean(),
    tenant_trade_name: z.string().nullable(),
    document_type: z.string().nullable(),
    template_version: z.number().int().positive().nullable(),
    signed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).nullable(),
    status: z.enum(ESTADOS_PUBLICOS).nullable(),
    evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    level: z.string().nullable(),
  })
  .strict();

export type RespostaVerificacao = z.infer<typeof respostaVerificacaoSchema>;

export const NAO_ENCONTRADO: RespostaVerificacao = Object.freeze({
  exists: false,
  tenant_trade_name: null,
  document_type: null,
  template_version: null,
  signed_at: null,
  status: null,
  evidence_sha256: null,
  level: null,
});

/** O mínimo do cliente que a verificação usa (testes sem o Supabase). */
type ErroRpc = { code?: string; message?: string; details?: string } | null;
type ArgsDoLimite = Parameters<ReturnType<ClienteDoLimite["schema"]>["rpc"]>[1];
export type ClienteDaVerificacao = {
  schema(nome: "api"): {
    rpc: {
      (fn: "rate_limit_hit", args: ArgsDoLimite): PromiseLike<{ data: boolean | null; error: ErroRpc }>;
      (fn: "atta_code_verify", args: { p_code: string }): PromiseLike<{ data: unknown; error: ErroRpc }>;
    };
  };
};

export async function verificarCodigo(
  entrada: string,
  recebidos: Headers,
  cliente?: ClienteDaVerificacao,
): Promise<Resultado<RespostaVerificacao>> {
  const c = cliente ?? (criarClienteAdmin(recebidos) as unknown as ClienteDaVerificacao);
  const limite = await consumirLimite(LIMITES.verificacaoPublicaPorIp, ipDoCliente(recebidos, (v) => isIP(v) !== 0), c);
  if (!limite.ok) return limite;

  let codigo: string;
  try {
    codigo = normalizeAttaCode(entrada);
  } catch {
    return ok(NAO_ENCONTRADO);
  }

  const { data, error } = await c.schema("api").rpc("atta_code_verify", { p_code: codigo });
  if (error) return falhaDoBanco(error);
  const linha = Array.isArray(data) ? data[0] : data;
  const lida = respostaVerificacaoSchema.safeParse(linha);
  // resposta fora do contrato é defeito: erro interno sem detalhe. Nunca "não encontrado", que negaria um documento
  // que existe (é uma verificação com efeito jurídico).
  if (!lida.success) {
    logger.error("verificacao.resposta_fora_do_contrato", { campos: lida.error.issues.length });
    return falha("INTERNO", MENSAGENS.INTERNO);
  }
  return ok(lida.data);
}
