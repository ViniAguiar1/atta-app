/**
 * Download dos PDFs no fim do PROpass (PDD v206 §10.4.3; ADR 0001, §"Download dos PDFs no fim do PROpass"; contrato
 * do Tech Lead e decisão do CTO, 21/11). A rota GET /propass/documentos/[tipo] (Frontend 6) lê o cookie HttpOnly com o
 * segredo do grant 'propass_download' e chama baixarDocumentoDoPropass, que:
 *   - pede o material ao banco (api.propass_download_context, só service_role), que confere o grant, conta o uso e
 *     grava a trilha só com o tipo;
 *   - 'termo': confere o hash dos bytes assinados, preenche o texto da versão com os valores DO PAYLOAD e monta a versão
 *     selada (Código ATTA, hash e onde verificar);
 *   - 'dados': decifra no servidor os dados do profissional (envelope dele, getCofre('network'); ADR 0002 §6) e monta a
 *     cópia, com CPF e WhatsApp completos (decisão do CTO), sem guardar nada.
 * Sem grant, vencido, revogado ou acima do teto: NAO_AUTENTICADO, a mesma resposta para tudo (sem oráculo). Nada de dado
 * pessoal em log. Rota que chama declara `export const runtime = 'nodejs'`.
 */
import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { falha, falhaDoBanco, MENSAGENS, ok, type Resultado } from "@/lib/errors";
import { mascararCelular, mascararCpf } from "@/lib/brasil/documentos";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { getCofre, type Cofre } from "@/server/cofre";
import { columnAad, open } from "@/server/crypto/envelope";
import { hashDoSegredo } from "@/server/grant/politica";
import { gerarPdfDoTermo, gerarPdfDosDados } from "./pdf";

export const TIPOS_DE_DOCUMENTO = ["termo", "dados"] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];
export type DocumentoBaixado = Readonly<{ nomeArquivo: string; conteudo: Uint8Array }>;

/** Os cabeçalhos da resposta da rota (contrato do Tech Lead): baixar como anexo, sem cache e sem adivinhar o tipo. */
export function cabecalhosDoPdf(nomeArquivo: string): Record<string, string> {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

const HEX = /^[0-9a-f]+$/;
const termoSchema = z.object({
  payload_canonical_b64: z.string().min(1),
  atta_code: z.string().regex(/^ATTA-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/),
  evidence_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  body: z.string().min(1),
  body_sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const dadosSchema = z.object({
  professional_id: z.string().uuid(),
  nome: z.string().min(1),
  conselho: z.string().min(1),
  uf: z.string().min(2),
  numero: z.string().min(1),
  cpf_enc: z.string().regex(HEX),
  phone_enc: z.string().regex(HEX).nullable(),
  email_enc: z.string().regex(HEX),
  dek_wrapped: z.string().regex(HEX),
  kek_version: z.number().int().positive(),
  clinica_nome: z.string().min(1),
  clinica_razao_social: z.string().nullable(),
  enviado_em: z.string(),
});
const payloadSchema = z.object({
  tenant: z.object({ legal_name: z.string(), trade_name: z.string(), cnpj: z.string() }),
  parties: z.array(z.object({ ref: z.string(), name: z.string(), council: z.string().optional() })),
  signature: z.object({ signer: z.string(), signed_at: z.string() }),
});

type ErroRpc = { code?: string; message?: string; details?: string } | null;
export type ClienteDoDownload = {
  schema(nome: "api"): {
    rpc(fn: "propass_download_context", args: { p_download_hash: string; p_kind: TipoDeDocumento }):
      PromiseLike<{ data: unknown; error: ErroRpc }>;
  };
};

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const indisponivel = () => falha("NAO_AUTENTICADO", MENSAGENS.NAO_AUTENTICADO);

/** O texto que o profissional leu, refeito com os valores do payload assinado (os mesmos do preencherTermo). */
function textoDoPayload(body: string, bodySha256: string, p: z.infer<typeof payloadSchema>): { texto: string; signatario: string } {
  if (sha256(body) !== bodySha256) throw new Error("texto do termo fora da versão");
  const signatario = p.parties.find((x) => x.ref === p.signature.signer);
  if (!signatario?.council) throw new Error("signatário fora do payload");
  const campos: Record<string, string> = {
    "profissional.nome": signatario.name,
    "profissional.registro": signatario.council,
    "clinica.razao_social": p.tenant.legal_name,
    "clinica.cnpj": p.tenant.cnpj,
    "clinica.nome": p.tenant.trade_name,
  };
  const texto = body.replace(/\{\{([a-z_.]+)\}\}/g, (_, chave: string) => {
    const valor = campos[chave];
    if (valor === undefined) throw new Error("campo desconhecido no termo");
    return valor;
  });
  return { texto, signatario: `${signatario.name} (${signatario.council})` };
}

async function abrirDados(d: z.infer<typeof dadosSchema>, cofre: Cofre): Promise<{ cpf: string; celular: string | null; email: string }> {
  const tabela = "platform.professional";
  const dek = await cofre.unwrapDataKey(
    { kekVersion: d.kek_version, blob: Buffer.from(d.dek_wrapped, "hex") },
    { tenant_id: "", table: tabela, column: "dek", id: d.professional_id },
  );
  try {
    const abrir = (hex: string, coluna: "cpf_enc" | "phone_enc" | "email_enc") =>
      open(Buffer.from(hex, "hex"), dek, columnAad("", tabela, coluna, d.professional_id)).toString("utf8");
    return {
      cpf: abrir(d.cpf_enc, "cpf_enc"),
      celular: d.phone_enc ? abrir(d.phone_enc, "phone_enc") : null,
      email: abrir(d.email_enc, "email_enc"),
    };
  } finally {
    dek.fill(0);
  }
}

export async function baixarDocumentoDoPropass(
  segredo: string,
  tipo: TipoDeDocumento,
  deps: { cliente?: ClienteDoDownload; cofre?: Cofre } = {},
): Promise<Resultado<DocumentoBaixado>> {
  if (!TIPOS_DE_DOCUMENTO.includes(tipo)) return indisponivel();
  const hash = hashDoSegredo(segredo);
  if (!hash) return indisponivel();
  const c = deps.cliente ?? (criarClienteAdmin() as unknown as ClienteDoDownload);
  const { data, error } = await c.schema("api").rpc("propass_download_context", {
    p_download_hash: `\\x${hash.toString("hex")}`,
    p_kind: tipo,
  });
  if (error) return error.code === "42501" ? indisponivel() : falhaDoBanco(error);
  const linha = (Array.isArray(data) ? data[0] : data) as { kind?: unknown; content?: unknown } | undefined;
  if (!linha || linha.kind !== tipo) return falha("INTERNO", MENSAGENS.INTERNO);

  try {
    if (tipo === "termo") {
      const t = termoSchema.parse(linha.content);
      const bytes = Buffer.from(t.payload_canonical_b64, "base64");
      if (sha256(bytes) !== t.evidence_sha256) return falha("INTERNO", MENSAGENS.INTERNO); // registro adulterado
      const payload = payloadSchema.parse(JSON.parse(bytes.toString("utf8")));
      const { texto, signatario } = textoDoPayload(t.body, t.body_sha256, payload);
      const conteudo = await gerarPdfDoTermo({
        texto, codigoAtta: t.atta_code, evidenceSha256: t.evidence_sha256, assinadoEm: payload.signature.signed_at, signatario,
      });
      return ok({ nomeArquivo: `termo-de-autorizacao-${t.atta_code}.pdf`, conteudo });
    }
    const d = dadosSchema.parse(linha.content);
    const aberto = await abrirDados(d, deps.cofre ?? getCofre("network"));
    const conteudo = await gerarPdfDosDados({
      clinica: d.clinica_razao_social ? `${d.clinica_nome} (${d.clinica_razao_social})` : d.clinica_nome,
      enviadoEm: d.enviado_em,
      campos: [
        ["Nome completo", d.nome],
        ["E-mail profissional", aberto.email],
        ["CPF", mascararCpf(aberto.cpf)],
        ["Conselho", `${d.conselho.toUpperCase()}-${d.uf.toUpperCase()} ${d.numero}`],
        ["WhatsApp", aberto.celular ? mascararCelular(aberto.celular) : "—"],
      ],
    });
    return ok({ nomeArquivo: "meus-dados-propass.pdf", conteudo });
  } catch {
    return falha("INTERNO", MENSAGENS.INTERNO); // sem eco de dado nem do motivo
  }
}
