import "server-only";
import { headers } from "next/headers";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { portaConselho } from "@/server/conselho/porta";
import { paraBytea } from "@/server/pacientes/contato";
import { abrirConvite } from "./convite";
import type { ConvitePropass, PortaPropass, SituacaoDoConselho } from "./porta";

// Porta real do PROpass (MIG-55; PDD v206 §10.4.3; ADR 0004 §3) sobre o servidor do Backend 4 (#187, #208) e do
// Backend 3 (#192, #220). Fluxo de link: o navegador nunca fala com o Supabase; aqui o cliente admin chama funções em
// api só para service_role, sempre pelo hash do segredo do link (nunca por id vindo da tela). O e-mail do convite abre
// no servidor (abrirConvite) e vai travado para a tela. Nada de CPF, e-mail, telefone ou PIN em log.

const FUSO_PADRAO = "America/Sao_Paulo"; // o resolve ainda não traz o fuso da clínica (pedido ao Backend 4)

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

export const portaPropassReal: Pick<PortaPropass, "resolver" | "conferirConselho"> = {
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
};
