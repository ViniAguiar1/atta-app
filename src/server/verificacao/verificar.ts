/**
 * Verificação pública do Código ATTA (MIG-24; PDD v206 §18.6 e §10.3.3; ADR 0006 §6 do atta-platform e ADR 0007).
 * A resposta tem 10 chaves (as 8 da ADR 0006, mais `integrity` e `tenant_cnpj` da ADR 0007), sem conteúdo nem dado
 * pessoal. Código inexistente e malformado dão a mesma resposta (exists = false, resto nulo): a rota não vira oráculo.
 * Integridade (ADR 0007 §1): o servidor recalcula o sha256 do payload guardado e confere os selos com o verifySeal;
 * 'confere' só com hash igual e pelo menos um selo válido; sem selo, null; qualquer outra coisa, 'nao_confere'.
 *
 * Ordem: (1) limite de 30 por minuto por IP e (2) teto de 600 por minuto da rota inteira, contados antes de tudo,
 * inclusive para código malformado; (3) normaliza o que a pessoa digitou (normalizeAttaCode: minúscula, espaço, sem
 * hífen); (4) só então o banco (api.atta_code_verify, só service_role), que grava na trilha só o que encontrou; (5) só
 * quando o documento existe, o material da integridade (api.atta_code_material) e o cálculo aqui.
 * Usado pela rota GET /public/v1/verificar/[codigo] e pela página /verificar (Frontend, MIG-54).
 */
import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { attaCode, normalizeAttaCode } from "@/lib/atta-sign/attasign";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { ipDoCliente } from "@/lib/http/correlacao";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { type SealManifestEntry, verifySeal } from "@/server/atta-sign/seal";
import { type ClienteDoLimite, consumirLimite, LIMITES } from "@/server/limite";

export const ESTADOS_PUBLICOS = ["pre_assinado", "assinado_definitivo", "cancelado", "substituido", "recusado"] as const;

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** A linha do api.atta_code_verify (9 colunas; a integridade não vem do banco). */
const linhaDoBancoSchema = z
  .object({
    exists: z.boolean(),
    tenant_trade_name: z.string().nullable(),
    document_type: z.string().nullable(),
    template_version: z.number().int().positive().nullable(),
    signed_at: z.string().regex(ISO_MS).nullable(),
    status: z.enum(ESTADOS_PUBLICOS).nullable(),
    evidence_sha256: z.string().regex(SHA256_HEX).nullable(),
    level: z.string().nullable(),
    tenant_cnpj: z.string().nullable(),
  })
  .strict();

export const INTEGRIDADES = ["confere", "nao_confere"] as const;
export type Integridade = (typeof INTEGRIDADES)[number] | null;

/** A resposta pública: as 9 colunas do banco e a integridade calculada aqui (ADR 0007). */
export const respostaVerificacaoSchema = linhaDoBancoSchema.extend({ integrity: z.enum(INTEGRIDADES).nullable() }).strict();

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
  tenant_cnpj: null,
  integrity: null,
});

/** O material da integridade (api.atta_code_material): fica no servidor, nunca vai à resposta. */
export const materialSchema = z.object({
  payload_canonical_b64: z.string().min(1),
  evidence_sha256: z.string().regex(SHA256_HEX),
  signed_at: z.string().regex(ISO_MS),
  seals: z.array(z.object({ kid: z.string().min(1), sig_b64: z.string().min(1) })),
  seal_keys: z.array(
    z.object({
      kid: z.string().min(1),
      alg: z.literal("Ed25519"),
      public_key_spki_b64: z.string().min(1),
      valid_from: z.string().regex(ISO_MS),
      valid_until: z.string().regex(ISO_MS).nullable(),
    }),
  ),
});
export type MaterialDaIntegridade = z.infer<typeof materialSchema>;

/**
 * ADR 0007 §1: sem selo, null; 'confere' só quando, nos bytes guardados: o sha256 recalculado é igual ao hash guardado,
 * o código consultado é o que nasce desse hash (attaCode; o nonce de colisão fica dentro do payload, ADR 0006), o
 * signature.signed_at do payload é o mesmo instante da coluna, e pelo menos um selo passa no verifySeal com a chave
 * válida nesse signed_at dos bytes (regra do #61). Qualquer outra coisa, 'nao_confere'. Notas da Segurança e do
 * Backend 3 no #225.
 */
export function conferirIntegridade(m: MaterialDaIntegridade, codigo: string): Integridade {
  if (m.seals.length === 0) return null;
  const bytes = Buffer.from(m.payload_canonical_b64, "base64");
  const recalculado = createHash("sha256").update(bytes).digest("hex");
  if (recalculado !== m.evidence_sha256) return "nao_confere";
  if (attaCode(recalculado) !== codigo) return "nao_confere";
  const assinadoEm = signedAtDosBytes(bytes);
  if (assinadoEm === null || Date.parse(assinadoEm) !== Date.parse(m.signed_at)) return "nao_confere";
  const manifesto: SealManifestEntry[] = m.seal_keys.map((k) => ({ ...k, alg: "Ed25519" as const }));
  const algumValido = m.seals.some((s) =>
    verifySeal(recalculado, { kid: s.kid, alg: "Ed25519", sig_b64: s.sig_b64 }, manifesto, assinadoEm),
  );
  return algumValido ? "confere" : "nao_confere";
}

/** O signature.signed_at do payload canônico assinado, em ISO UTC com ms; null se faltar ou vier em outra forma. */
function signedAtDosBytes(bytes: Buffer): string | null {
  try {
    const valor: unknown = (JSON.parse(bytes.toString("utf8")) as { signature?: { signed_at?: unknown } })?.signature
      ?.signed_at;
    return typeof valor === "string" && ISO_MS.test(valor) ? valor : null;
  } catch {
    return null;
  }
}

/** O mínimo do cliente que a verificação usa (testes sem o Supabase). */
type ErroRpc = { code?: string; message?: string; details?: string } | null;
type ArgsDoLimite = Parameters<ReturnType<ClienteDoLimite["schema"]>["rpc"]>[1];
export type ClienteDaVerificacao = {
  schema(nome: "api"): {
    rpc: {
      (fn: "rate_limit_hit", args: ArgsDoLimite): PromiseLike<{ data: boolean | null; error: ErroRpc }>;
      (fn: "atta_code_verify", args: { p_code: string }): PromiseLike<{ data: unknown; error: ErroRpc }>;
      (fn: "atta_code_material", args: { p_code: string }): PromiseLike<{ data: unknown; error: ErroRpc }>;
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
  // teto da rota inteira, contra ataque distribuído (Tech Lead no #114): passou, a rota fica indisponível por um minuto
  const teto = await consumirLimite(LIMITES.verificacaoPublicaGlobal, "rota", c);
  if (!teto.ok) {
    if (teto.error.code === "LIMITE") logger.warn("verificacao.teto_global");
    return teto.error.code === "LIMITE" ? falha("INDISPONIVEL", MENSAGENS.INDISPONIVEL) : teto;
  }

  let codigo: string;
  try {
    codigo = normalizeAttaCode(entrada);
  } catch {
    return ok(NAO_ENCONTRADO);
  }

  const { data, error } = await c.schema("api").rpc("atta_code_verify", { p_code: codigo });
  if (error) return falhaDoBanco(error);
  const lida = linhaDoBancoSchema.safeParse(Array.isArray(data) ? data[0] : data);
  // resposta fora do contrato é defeito: erro interno sem detalhe. Nunca "não encontrado", que negaria um documento
  // que existe (é uma verificação com efeito jurídico).
  if (!lida.success) {
    logger.error("verificacao.resposta_fora_do_contrato", { campos: lida.error.issues.length });
    return falha("INTERNO", MENSAGENS.INTERNO);
  }
  // o "não encontrado" não vai à trilha do banco (cabeça da cadeia única); fica só aqui, sem o código
  if (!lida.data.exists) {
    logger.info("verificacao.nao_encontrado");
    return ok(NAO_ENCONTRADO);
  }

  // integridade (ADR 0007): só quando o documento existe; o material não sai daqui
  const mat = await c.schema("api").rpc("atta_code_material", { p_code: codigo });
  if (mat.error) return falhaDoBanco(mat.error);
  const material = materialSchema.safeParse(Array.isArray(mat.data) ? mat.data[0] : mat.data);
  if (!material.success) {
    logger.error("verificacao.material_fora_do_contrato", { campos: material.error.issues.length });
    return falha("INTERNO", MENSAGENS.INTERNO);
  }
  const integrity = conferirIntegridade(material.data, codigo);
  if (integrity === "nao_confere") logger.warn("verificacao.integridade_nao_confere");
  return ok({ ...lida.data, integrity });
}
