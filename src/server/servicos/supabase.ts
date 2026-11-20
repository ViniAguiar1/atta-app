import "server-only";
import { falha, falhaDoBanco, MENSAGENS, ok } from "@/lib/errors";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PortaServicos } from "./porta";

// Adaptador real (Backend 6, PR #76): com a sessão do usuário, então a RLS e o has_permission('settings', ...) valem.
// - bloqueios: api.atta_in_service_delete_blockers(p_service_id) → (template_id, title); exige settings.edit; Serviço
//   de outra clínica, já excluído ou inexistente volta P0002 ATTA-CORE-0005 (NAO_ENCONTRADO pelo falhaDoBanco).
// - exclusão: exclusão lógica (deleted_at) em atta_in.clinic_service; com termo Ativo só com esse Serviço, o gatilho
//   recusa com P0001 ATTA-IN-0004 / clinic_service_id (CONFLITO, reason "ATTA-IN-0004:clinic_service_id").
export const portaServicosSupabase: PortaServicos = {
  async bloqueiosParaExcluir(servicoId) {
    const cliente = await criarClienteServidor();
    const { data, error } = await cliente
      .schema("api")
      .rpc("atta_in_service_delete_blockers", { p_service_id: servicoId });
    if (error) return falhaDoBanco(error);
    return ok((data ?? []).map((t) => ({ templateId: t.template_id, titulo: t.title })));
  },
  async excluir(servicoId) {
    const cliente = await criarClienteServidor();
    const { data, error } = await cliente
      .schema("atta_in")
      .from("clinic_service")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", servicoId)
      .is("deleted_at", null)
      .select("id");
    if (error) return falhaDoBanco(error);
    // nenhuma linha: Serviço de outra clínica (RLS), já excluído ou inexistente — a mesma resposta, de propósito
    if (!data || data.length === 0) return falha("NAO_ENCONTRADO", MENSAGENS.NAO_ENCONTRADO);
    return ok(undefined);
  },
};
