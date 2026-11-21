/**
 * MIG-21c (parte 2, servidor): monta o pacote do ATTA Sign do Termo de Autorização de Uso de Imagem de Assinatura
 * Digital (PDD v206 §10.4.3) para o api.propass_submit (Backend 4), que o grava numa transação só pela
 * private.document_insert_signed_authorization (#192; ADR 0001 §1). O banco confere; o servidor monta:
 *   1. o PNG da assinatura desenhada, cifrado com uma DEK própria envelopada por getCofre('documents') e enviado ao
 *      bucket privado 'documents' em <tenant>/<documento>/assinatura.png (ADR 0002; ADR 0026);
 *   2. o payload v1 (ADR 0006 §3), em JCS (RFC 8785), com o hash, o Código ATTA (60 bits, Crockford) e o selo Ed25519
 *      sobre o evidence_sha256, conferido aqui contra a própria chave antes de sair (verifySeal).
 * Nada de dado pessoal no log. A chave privada do selo vem de ATTA_SEAL_PRIVATE_KEY e nunca sai deste processo.
 * Rota que chama declara `export const runtime = 'nodejs'`.
 */
import "server-only";
import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { attaCode, evidenceSha256 } from "@/lib/atta-sign/attasign";
import { canonicalize, type Json } from "@/lib/atta-sign/jcs";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { getCofre, type Cofre } from "@/server/cofre";
import { columnAad, seal as cifrar } from "@/server/crypto/envelope";
import { signEvidence, verifySeal, type SealManifestEntry } from "./seal";

export const BUCKET_DE_DOCUMENTOS = "documents"; // bucket privado do #217 (Backend 1; nome pelo Tech Lead)
/** Teto do PNG da assinatura desenhada (o banco recusa acima disso no traço; o canvas gera dezenas de KiB). */
export const TETO_DO_PNG = 512 * 1024;
const PNG_ASSINATURA = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX_SHA256 = /^[0-9a-f]{64}$/;

/**
 * "CRO-SP 11111": a forma do registro no payload e no texto do termo. O banco recalcula a mesma forma a partir de
 * platform.professional para conferir o signatário (revisão da Segurança no #208).
 */
export function registroDoConselho(conselho: string, uf: string, numero: string): string {
  return `${conselho.toUpperCase()}-${uf.toUpperCase()} ${numero}`;
}

export type DadosDoTermo = Readonly<{
  tenantId: string;
  vinculoId: string; // platform.professional_tenant_link.id
  clinica: Readonly<{ razaoSocial: string; nomeFantasia: string; cnpj: string }>;
  profissional: Readonly<{ nome: string; conselho: string; uf: string; numero: string }>;
  /** A versão vigente do modelo de sistema (private.authorization_template_version), lida pelo servidor. */
  modelo: Readonly<{ id: string; versao: number; bodySha256: string; bodyNormalization: string }>;
  assinatura: Readonly<{
    png: Uint8Array;
    abertoEm: Date; // quando o termo apareceu
    rolagemCompletaEm: Date; // "Leia até o fim": o quadro só abre depois
    ip: string | null;
    userAgent: string | null;
  }>;
}>;

/** Os seis parâmetros que o api.propass_submit repassa à private.document_insert_signed_authorization. */
export type PacoteDoTermo = Readonly<{
  p_document_id: string;
  p_payload_canonical: string; // bytea pelo PostgREST: hex com \x
  p_atta_code: string;
  p_seal_kid: string;
  p_seal: string; // bytea pelo PostgREST: hex com \x
  p_stroke: Readonly<{ storage_path: string; sha256_plain: string; size_bytes: number; dek_wrapped: string; kek_version: number }>;
}>;

export type Dependencias = Readonly<{
  cofre?: Cofre;
  /** Sobe o objeto cifrado; recusa se o caminho já existir (sem sobrescrever). Padrão: subirNoStorage. */
  subir?: (caminho: string, conteudo: Uint8Array) => Promise<void>;
  agora?: () => Date;
  novoId?: () => string;
  chave?: Readonly<{ kid: string; privadaPem: string }>;
}>;

const iso = (d: Date) => d.toISOString(); // sempre em ms e UTC ("…T….mmmZ"), como o verificador aceita (#61)
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

function chaveDoAmbiente(): { kid: string; privadaPem: string } {
  const kid = process.env.ATTA_SEAL_KID;
  const privadaPem = process.env.ATTA_SEAL_PRIVATE_KEY;
  if (!kid || !privadaPem) throw new Error("selo do ATTA Sign sem ATTA_SEAL_KID ou ATTA_SEAL_PRIVATE_KEY");
  return { kid, privadaPem };
}

function validar(d: DadosDoTermo): void {
  const png = d.assinatura.png;
  if (!UUID.test(d.tenantId) || !UUID.test(d.vinculoId) || !UUID.test(d.modelo.id)) throw new Error("id fora do formato");
  if (!HEX_SHA256.test(d.modelo.bodySha256) || !Number.isInteger(d.modelo.versao) || d.modelo.versao < 1) {
    throw new Error("versão do modelo inválida");
  }
  if (png.length < PNG_ASSINATURA.length || png.length > TETO_DO_PNG || !PNG_ASSINATURA.every((b, i) => png[i] === b)) {
    throw new Error("a assinatura desenhada precisa ser um PNG de até 512 KiB");
  }
  if (d.assinatura.rolagemCompletaEm < d.assinatura.abertoEm) throw new Error("a leitura até o fim veio antes da abertura");
}


/** Subida padrão: bucket privado, só o servidor (service_role), sem sobrescrever e sem tipo que o navegador execute. */
export async function subirNoStorage(caminho: string, conteudo: Uint8Array): Promise<void> {
  const { error } = await criarClienteAdmin()
    .storage.from(BUCKET_DE_DOCUMENTOS)
    .upload(caminho, conteudo, { contentType: "application/octet-stream", upsert: false });
  if (error) throw new Error("falha ao guardar a assinatura desenhada");   // sem eco do caminho nem do erro
}

/** Monta o pacote. Sobe só o PNG cifrado; o resto vai ao banco pelo submit, que confere e grava tudo ou nada. */
export async function assinarTermoDeAutorizacao(dados: DadosDoTermo, deps: Dependencias = {}): Promise<PacoteDoTermo> {
  validar(dados);
  const agora = (deps.agora ?? (() => new Date()))();
  const documentoId = (deps.novoId ?? randomUUID)();
  const chave = deps.chave ?? chaveDoAmbiente();
  const cofre = deps.cofre ?? getCofre("documents");
  if (agora < dados.assinatura.rolagemCompletaEm) throw new Error("assinatura antes da leitura até o fim");

  // 1. PNG cifrado: DEK própria por objeto, envelopada pelo Cofre; a AAD prende o conteúdo ao documento e à clínica
  const png = dados.assinatura.png;
  const strokeSha256 = sha256(png);
  const contexto = { tenant_id: dados.tenantId, table: "documents.stored_object", column: "signature_stroke", id: documentoId };
  const { plaintext: dek, wrapped } = await cofre.generateDataKey(contexto);
  let cifrado: Buffer;
  try {
    cifrado = cifrar(png, dek, columnAad(dados.tenantId, contexto.table, contexto.column, documentoId));
  } finally {
    dek.fill(0);
  }
  const caminho = `${dados.tenantId}/${documentoId}/assinatura.png`;
  await (deps.subir ?? subirNoStorage)(caminho, cifrado);

  // 2. payload v1 (ADR 0006 §3; os campos que a private.document_insert_signed_authorization confere)
  const assinadoEm = iso(agora);
  const payload = {
    atta_sign_version: "1",
    document: {
      id: documentoId,
      type: "termo_de_autorizacao",
      template_id: dados.modelo.id,
      template_version: dados.modelo.versao,
      body_sha256: dados.modelo.bodySha256,
      body_normalization: dados.modelo.bodyNormalization,
    },
    tenant: { legal_name: dados.clinica.razaoSocial, trade_name: dados.clinica.nomeFantasia, cnpj: dados.clinica.cnpj },
    parties: [
      {
        ref: "p1",
        role: "professional",
        capacity: "titular",
        acting_for: null,
        name: dados.profissional.nome,
        council: registroDoConselho(dados.profissional.conselho, dados.profissional.uf, dados.profissional.numero),
      },
    ],
    signature: {
      signer: "p1",
      level: "atta_sign",
      signed_at: assinadoEm,
      stroke_sha256: strokeSha256,
      ip: dados.assinatura.ip,
      user_agent_sha256: dados.assinatura.userAgent ? sha256(dados.assinatura.userAgent) : null,
      exposure: {
        opened_at: iso(dados.assinatura.abertoEm),
        scroll_completed_at: iso(dados.assinatura.rolagemCompletaEm),
        accepted_at: assinadoEm,
        exposure_ms: agora.getTime() - dados.assinatura.abertoEm.getTime(),
        scroll_complete: true,
      },
      auth_factors: ["propass_link"],
      assisted_by: null,
    },
    context: { product: "atta_in", context_type: "professional_authorization", context_id: dados.vinculoId, consent_purpose: null },
    extensions: {},
  } satisfies Json;

  const evidencia = evidenceSha256(payload);
  const selo = signEvidence(evidencia, chave.kid, chave.privadaPem);
  // confere o selo contra a própria chave antes de sair: chave trocada ou corrompida não vira termo gravado
  const publica = createPublicKey(chave.privadaPem).export({ type: "spki", format: "der" }).toString("base64");
  const manifesto: SealManifestEntry[] = [
    { kid: chave.kid, alg: "Ed25519", public_key_spki_b64: publica, valid_from: "1970-01-01T00:00:00.000Z", valid_until: null },
  ];
  if (!verifySeal(evidencia, selo, manifesto, assinadoEm)) throw new Error("o selo não confere com a chave do servidor");

  return {
    p_document_id: documentoId,
    p_payload_canonical: `\\x${hex(canonicalize(payload))}`,
    p_atta_code: attaCode(evidencia),
    p_seal_kid: chave.kid,
    p_seal: `\\x${Buffer.from(selo.sig_b64, "base64").toString("hex")}`,
    p_stroke: {
      storage_path: caminho,
      sha256_plain: strokeSha256,
      size_bytes: png.length,
      dek_wrapped: hex(wrapped.blob),
      kek_version: wrapped.kekVersion,
    },
  };
}
