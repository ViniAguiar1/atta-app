import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import { ACOES_DE_MODELO, ESTADOS_DE_MODELO, type ModeloDeDocumento, type PortaDocumentos, TIPOS_DE_MODELO } from "./porta";

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
  servicos: r.clinic_service_ids ?? [],
  atualizadoEm: r.updated_at,
  acoes: r.allowed_actions.flatMap((a) => (conhecida(a.action) ? [{ acao: a.action, motivoDesabilitado: a.disabled_reason ?? null }] : [])),
});

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
    return ok(lido.data.map(paraModelo));
  },
};
