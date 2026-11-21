import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { portaConselho } from "@/server/conselho/porta";
import { paraBytea } from "@/server/pacientes/contato";
import { type ContextoDoTermo, preencherTermo } from "@/server/atta-sign/termo-autorizacao";
import { abrirConvite } from "./convite";
import { conferirIdentidade, enviarPropass } from "./envio";
import type { ConvitePropass, PortaPropass, SituacaoDoConselho, TermoDeAutorizacao } from "./porta";

// Porta real do PROpass (MIG-55; PDD v206 §10.4.3; ADR 0004 §3) sobre o servidor do Backend 4 (#187, #208) e do
// Backend 3 (#192, #220). Fluxo de link: o navegador nunca fala com o Supabase; aqui o cliente admin chama funções em
// api só para service_role, sempre pelo hash do segredo do link (nunca por id vindo da tela). O e-mail do convite abre
// no servidor (abrirConvite) e vai travado para a tela. Nada de CPF, e-mail, telefone ou PIN em log.

const FUSO_PADRAO = "America/Sao_Paulo"; // o resolve ainda não traz o fuso da clínica (pedido ao Backend 4)

const contextoSchema = z.object({
  legal_name: z.string().min(1),
  trade_name: z.string().min(1),
  cnpj: z.string().regex(/^\d{14}$/),
  template_id: z.uuid(),
  version: z.number().int().positive(),
  body_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  body_normalization: z.string().min(1),
  body: z.string().min(1),
});

/** O texto preenchido vira o título (1ª linha do modelo) e os parágrafos (separados por linha em branco). */
export function emParagrafos(texto: string): TermoDeAutorizacao {
  const [titulo = "", ...paragrafos] = texto.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { titulo, paragrafos };
}

const resolveSchema = z.object({
  tenant_id: z.uuid(),
  tenant_name: z.string().min(1),
  invited_at: z.string(),
  invite_email_enc: z.string(),
  invite_envelope_id: z.uuid(),
  invite_dek_wrapped: z.string(),
  invite_kek_version: z.number().int(),
});

/** Link desconhecido, vencido, revogado ou de vínculo excluído: a mesma resposta (ATTA-AUTH-0004), sem oráculo. */
const SEM_LINK = falha("NAO_ENCONTRADO", "Não encontrado.");

async function resolverLinha(hashDoLink: Buffer) {
  const api = criarClienteAdmin(await headers()).schema("api");
  const { data, error } = await api.rpc("propass_resolve", { p_secret_hash: paraBytea(hashDoLink) });
  if (error) return error.code === "42501" ? SEM_LINK : falhaDoBanco(error);
  const linha = z.array(resolveSchema).length(1).safeParse(data);
  if (!linha.success) return SEM_LINK; // nenhuma linha = link sem validade
  return ok(linha.data[0]!);
}

export const portaPropassReal: PortaPropass = {
  async resolver(hashDoLink): Promise<Resultado<ConvitePropass>> {
    const r = await resolverLinha(hashDoLink);
    if (!r.ok) return r;
    try {
      const emailDoConvite = await abrirConvite(r.data);
      return ok({ clinica: r.data.tenant_name, emailDoConvite, conviteEm: r.data.invited_at, fuso: FUSO_PADRAO });
    } catch {
      logger.error("propass.convite_nao_abriu", { code: "INTERNO" }); // sem o e-mail nem o envelope
      return falha("INTERNO", "Algo deu errado. Tente de novo.");
    }
  },
  async conferirConselho(hashDoLink, registro): Promise<Resultado<SituacaoDoConselho>> {
    const link = await resolverLinha(hashDoLink); // o passo 2 só anda com o link válido
    if (!link.ok) return link;
    return ok(await portaConselho.conferir(registro));
  },
  /**
   * Passo 3: o Termo da versão vigente do modelo de sistema (api.propass_authorization_context, #240), preenchido no
   * servidor pelo preencherTermo do Backend 3, que confere sha256(body) = body_sha256 e recusa campo que sobrar. O texto
   * lido sai dos mesmos valores que o assinarTermoDeAutorizacao põe no payload. Sem razão social, CNPJ ou modelo
   * (ATTA-IN-0003): erro, mostrado com a mensagem genérica, sem montar o termo.
   */
  async termo(hashDoLink, registro): Promise<Resultado<TermoDeAutorizacao>> {
    const api = criarClienteAdmin(await headers()).schema("api");
    const { data, error } = await api.rpc("propass_authorization_context", { p_secret_hash: paraBytea(hashDoLink) });
    if (error) return error.code === "42501" ? SEM_LINK : falhaDoBanco(error);
    const contexto = z.array(contextoSchema).length(1).safeParse(data);
    if (!contexto.success) return SEM_LINK;
    try {
      const { nome, conselho, uf, numero } = registro;
      return ok(emParagrafos(preencherTermo(contexto.data[0]! as ContextoDoTermo, { nome, conselho, uf, numero })));
    } catch {
      logger.error("propass.termo_nao_preencheu", { code: "INTERNO" }); // sem nome nem registro
      return falha("INTERNO", "Algo deu errado. Tente de novo.");
    }
  },
  /** Passo 2: o servidor do Backend 4 (#247), com o limite por IP e por link; o id do profissional não sai de lá. */
  async identidade(hashDoLink, registro, origem) {
    const r = await conferirIdentidade(hashDoLink, registro, origem);
    return r.ok ? ok(r.data.status) : r;
  },
  /** Envio final: o enviarPropass do Backend 4 (#247), tudo ou nada; o PNG e o PIN só existem nesta chamada. */
  async enviar(hashDoLink, envio) {
    const r = await enviarPropass(hashDoLink, {
      dados: envio.dados,
      assinaturaPng: envio.assinaturaPng,
      pin: envio.pin,
      leitura: envio.leitura,
      origem: envio.origem,
    });
    return r.ok ? ok({ status: r.data.status }) : r;
  },
};
