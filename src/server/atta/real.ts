import "server-only";
import { criarClienteServidor } from "@/lib/supabase/server";
import type { PortaAtta, ResumoDosDados } from "./porta";

// Implementação real (sessão do usuário, RLS da clínica do token). Cada contagem é independente: se uma falhar (ex.: o
// team_list é só do ADMIN), ela vira null e as outras seguem.
export const portaAttaReal: PortaAtta = {
  async resumoDosDados(): Promise<ResumoDosDados> {
    const supabase = await criarClienteServidor();
    const [membros, procedimentos, modelos, pacientes] = await Promise.all([
      supabase
        .schema("api")
        .rpc("team_list")
        .then(({ data, error }) => (error || !data ? null : data.filter((m) => m.status === "active").length)),
      supabase
        .schema("atta_in")
        .from("clinic_service")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .then(({ count, error }) => (error ? null : count)),
      supabase
        .schema("api")
        .rpc("atta_in_template_list")
        .then(({ data, error }) => (error || !data ? null : data.length)),
      supabase
        .schema("api")
        .rpc("patient_count")
        .then(({ data, error }) => (error || typeof data !== "number" ? null : data)),
    ]);
    return {
      membros,
      procedimentos,
      modelos,
      pacientes,
      documentosAssinados: null,
      respostasDeSaude: null,
      registrosDeAuditoria: null,
      requisicoesDeTitular: null,
      requisicoesEmAberto: null,
    };
  },
};
