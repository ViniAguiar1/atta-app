import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PortaDocumentos } from "./porta";
import { ACOES_DE_MODELO, ESTADOS_DE_MODELO, type ModeloDeDocumento, type ResumoDosModelos, TIPOS_DE_MODELO } from "./tipos";

// Porta real de Termos & Docs sobre o api.atta_in_template_list (#69, Backend 6). A resposta passa pelo Zod antes de
// virar linha de tela; o erro do banco vira Resultado por falhaDoBanco. Ação desconhecida (o banco ganhou uma nova antes
// da tela) é descartada, para a tela nunca mostrar botão sem destino.
const linhaSchema = z.object({
  id: z.uuid(),
  kind: z.enum(TIPOS_DE_MODELO),
  title: z.string().min(1),
  status: z.enum(ESTADOS_DE_MODELO),
  current_version: z.number().int().positive().nullable(),
  frequency: z.enum(["por_procedimento", "unica"]).nullable(),
  validity_months: z.union([z.literal(3), z.literal(6), z.literal(12)]).nullable(),
  required: z.boolean().nullable(),
  clinic_service_ids: z.array(z.uuid()).nullable(),
  updated_at: z.string(),
  allowed_actions: z.array(z.object({ action: z.string(), disabled_reason: z.string().optional() })),
});

const conhecida = (a: string): a is (typeof ACOES_DE_MODELO)[number] => (ACOES_DE_MODELO as readonly string[]).includes(a);

export const paraModelo = (r: z.infer<typeof linhaSchema>): ModeloDeDocumento => ({
  id: r.id,
  tipo: r.kind,
  titulo: r.title,
  estado: r.status,
  versaoAtual: r.current_version,
  frequencia: r.frequency,
  validadeMeses: r.validity_months,
  obrigatorio: r.required,
  procedimentos: (r.clinic_service_ids ?? []).map((id) => ({ id, nome: null })), // nomes: pedido ao Backend 6
  publicadoEm: null, // current_version_published_at: pedido ao Backend 6
  assinados: null, // contagem por modelo: pedido ao Backend 6
  atualizadoEm: r.updated_at,
  acoes: r.allowed_actions.flatMap((a) => (conhecida(a.action) ? [{ acao: a.action, motivoDesabilitado: a.disabled_reason ?? null }] : [])),
});

/**
 * Termos ativos, obrigatórios e opcionais saem da própria lista, no servidor. Vencendo, vencidos, assinados e o
 * percentual com ATTA Sign não têm fonte ainda (pedido ao Backend 6): vêm null, nunca 0 inventado.
 */
export function resumoDe(modelos: ModeloDeDocumento[]): ResumoDosModelos {
  const ativos = modelos.filter((m) => m.estado === "ativo");
  return {
    ativos: ativos.length,
    obrigatorios: ativos.filter((m) => m.obrigatorio === true).length,
    opcionais: ativos.filter((m) => m.obrigatorio === false).length,
    vencendo: null,
    vencidos: null,
    assinados: null,
    percentualAttaSign: null,
  };
}

export const portaDocumentosReal: PortaDocumentos = {
  async listar() {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.schema("api").rpc("atta_in_template_list");
    if (error) return falhaDoBanco(error);
    const lido = z.array(linhaSchema).safeParse(data);
    if (!lido.success) {
      logger.error("documentos.lista_fora_do_formato", { code: "INTERNO" }); // sem a resposta
      return falha("INTERNO", "Resposta fora do formato.");
    }
    const modelos = lido.data.map(paraModelo);
    return ok({ modelos, resumo: resumoDe(modelos) });
  },
};
