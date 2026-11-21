import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PortaDocumentos } from "./porta";
import { ACOES_DE_MODELO, ESTADOS_DE_MODELO, type ModeloDeDocumento, type ResumoDosModelos, TIPOS_DE_MODELO } from "./tipos";

// Porta real de Termos & Docs sobre o api.atta_in_template_list (#69, #148) e o api.atta_in_template_summary (#148),
// do Backend 6. A resposta passa pelo Zod antes de virar linha de tela; o erro do banco vira Resultado por falhaDoBanco.
// Ação desconhecida (o banco ganhou uma nova antes da tela) é descartada, para a tela nunca mostrar botão sem destino.
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
  clinic_services: z.array(z.object({ id: z.uuid(), name: z.string().min(1) })), // só os vivos, por nome; nunca nulo
  current_version_published_at: z.string().nullable(), // nulo em Rascunho
  signed_count: z.number().int().nonnegative(), // Assinado definitivo ou Substituído
});

// Os contadores de validade (vencendo e vencidos) vêm nulos até a PO decidir a validade do "Única" (R17).
const resumoSchema = z.object({
  active_count: z.number().int().nonnegative(),
  active_required_count: z.number().int().nonnegative(),
  active_optional_count: z.number().int().nonnegative(),
  expiring_count: z.number().int().nonnegative().nullable(),
  expired_count: z.number().int().nonnegative().nullable(),
  signed_count: z.number().int().nonnegative(),
  signed_atta_sign_count: z.number().int().nonnegative(),
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
  procedimentos: r.clinic_services.map((s) => ({ id: s.id, nome: s.name })),
  publicadoEm: r.current_version_published_at,
  assinados: r.signed_count,
  atualizadoEm: r.updated_at,
  acoes: r.allowed_actions.flatMap((a) => (conhecida(a.action) ? [{ acao: a.action, motivoDesabilitado: a.disabled_reason ?? null }] : [])),
});

/** Cartões do topo, prontos do banco. "100% com ATTA Sign" = signed_atta_sign_count / signed_count; sem assinado, "—". */
export function paraResumo(r: z.infer<typeof resumoSchema>): ResumoDosModelos {
  return {
    ativos: r.active_count,
    obrigatorios: r.active_required_count,
    opcionais: r.active_optional_count,
    vencendo: r.expiring_count,
    vencidos: r.expired_count,
    assinados: r.signed_count,
    // floor: 99,5% não pode aparecer como 100% (nota do Backend 6 no #184)
    percentualAttaSign: r.signed_count > 0 ? Math.floor((r.signed_atta_sign_count / r.signed_count) * 100) : null,
  };
}

export const portaDocumentosReal: PortaDocumentos = {
  async listar() {
    const api = (await criarClienteServidor()).schema("api");
    const [lista, resumo] = await Promise.all([api.rpc("atta_in_template_list"), api.rpc("atta_in_template_summary")]);
    if (lista.error) return falhaDoBanco(lista.error);
    if (resumo.error) return falhaDoBanco(resumo.error);
    const linhas = z.array(linhaSchema).safeParse(lista.data);
    const totais = z.array(resumoSchema).length(1).safeParse(resumo.data);
    if (!linhas.success || !totais.success) {
      logger.error("documentos.lista_fora_do_formato", { code: "INTERNO" }); // sem a resposta
      return falha("INTERNO", "Resposta fora do formato.");
    }
    return ok({ modelos: linhas.data.map(paraModelo), resumo: paraResumo(totais.data[0]!) });
  },
  async publicar(modeloId) {
    const api = (await criarClienteServidor()).schema("api");
    const { data, error } = await api.rpc("atta_in_template_publish", { p_template_id: modeloId });
    if (error) return falhaDoBanco(error);
    const versao = z.array(z.object({ version: z.number().int().positive() })).length(1).safeParse(data);
    return versao.success ? ok({ versao: versao.data[0]!.version }) : falha("INTERNO", "Resposta fora do formato.");
  },
  async inativar(modeloId) {
    const api = (await criarClienteServidor()).schema("api");
    const { error } = await api.rpc("template_deactivate", { p_template_id: modeloId });
    return error ? falhaDoBanco(error) : ok(undefined);
  },
  async vincular(modeloId, servicoIds) {
    const api = (await criarClienteServidor()).schema("api");
    const { error } = await api.rpc("template_set_services", { p_template_id: modeloId, p_service_ids: servicoIds });
    return error ? falhaDoBanco(error) : ok(undefined);
  },
  async servicos() {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.schema("atta_in").from("clinic_service").select("id, name, active").is("deleted_at", null).order("name");
    if (error) return falhaDoBanco(error);
    const lido = z.array(z.object({ id: z.uuid(), name: z.string().min(1), active: z.boolean() })).safeParse(data);
    return lido.success ? ok(lido.data.map((s) => ({ id: s.id, nome: s.name, ativo: s.active }))) : falha("INTERNO", "Resposta fora do formato.");
  },
};
