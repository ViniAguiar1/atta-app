import "server-only";
import { z } from "zod";
import { falha, falhaDoBanco, ok, type Resultado } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { criarClienteServidor } from "@/lib/supabase/server";
import { normalizarEndereco, selarEndereco } from "@/server/notificacoes/canal";
import type { PortaAlertas } from "./porta";
import { type AlertasDaEquipe, CATEGORIAS, EVENTOS, FREQUENCIAS } from "./tipos";

// Porta real de Configurações › Notificações sobre o MIG-15 (Backend 4, #295; contrato revisão 3 em
// desenho/mig-15-notificacoes-contrato.md). Sessão do usuário (nunca a secret key); quem confere o ADMIN
// (settings.view / settings.edit) e grava a trilha é o banco. O endereço da equipe: o servidor valida o formato e cifra
// pelo envelope (canal.ts do Backend 4) e o banco guarda só o envelope e a máscara; a leitura volta só mascarada.
const chaves = EVENTOS.map((e) => e.chave) as [string, ...string[]];
const respostaSchema = z.object({
  channels: z.object({
    email: z.object({ active: z.boolean(), masked: z.string().nullable() }),
    whatsapp: z.object({ active: z.boolean(), masked: z.string().nullable() }),
  }),
  events: z.array(z.object({ key: z.enum(chaves), category: z.enum(CATEGORIAS), email: z.boolean(), whatsapp: z.boolean() })),
  filters: z.object({ pausa_noturna: z.boolean(), frequencia_resumo: z.enum(FREQUENCIAS) }),
});

// formato inválido: a mesma recusa do banco (ATTA-IN-0001:address), validada aqui antes de cifrar
const formatoInvalido = () => falha("VALIDACAO", "Destino inválido.", [{ campo: "address", code: "VALIDACAO" }], "ATTA-IN-0001:address");

async function ler(supabase: Awaited<ReturnType<typeof criarClienteServidor>>): Promise<Resultado<AlertasDaEquipe>> {
  const { data, error } = await supabase.schema("api").rpc("notification_settings_get");
  if (error) return falhaDoBanco(error);
  const lido = respostaSchema.safeParse(data);
  if (!lido.success) {
    logger.error("alertas.leitura_fora_do_formato", { code: "INTERNO" });
    return falha("INTERNO", "Resposta fora do contrato.");
  }
  const { channels, events, filters } = lido.data;
  return ok({
    email: { ativo: channels.email.active, destinoMascarado: channels.email.masked },
    whatsapp: { ativo: channels.whatsapp.active, destinoMascarado: channels.whatsapp.masked },
    eventos: events.map((e) => ({ chave: e.key as AlertasDaEquipe["eventos"][number]["chave"], email: e.email, whatsapp: e.whatsapp })),
    filtros: { pausaNoturna: filters.pausa_noturna, frequenciaDoResumo: filters.frequencia_resumo },
    emPausaNoturna: null, // o contrato não traz; o chip some (nada calculado pelo relógio do navegador)
  });
}

export const portaAlertasReal: PortaAlertas = {
  async ler() {
    return ler(await criarClienteServidor());
  },
  async ligarCanal(canal, ativo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.schema("api").rpc("notification_channel_set", { p_channel: canal, p_active: ativo });
    return error ? falhaDoBanco(error) : ler(supabase);
  },
  async alterarCanal(canal, destino, ativar) {
    const endereco = normalizarEndereco(canal, destino);
    if (!endereco) return formatoInvalido();
    const supabase = await criarClienteServidor();
    const { data } = await supabase.auth.getClaims();
    const tenantId = typeof data?.claims?.tenant_id === "string" ? data.claims.tenant_id : null;
    if (!tenantId) return falha("NAO_AUTENTICADO", "Sessão sem clínica.");
    // sem ligar junto, o canal mantém o estado que tem (desligado + endereço novo: o banco recusa, ATTA-IN-0003:estado)
    let ativo = ativar === true;
    if (!ativar) {
      const atual = await ler(supabase);
      if (!atual.ok) return atual;
      ativo = atual.data[canal].ativo;
    }
    const selado = await selarEndereco({ tenantId, canal, endereco });
    const { error } = await supabase.schema("api").rpc("notification_channel_set", { p_channel: canal, p_active: ativo, ...selado });
    return error ? falhaDoBanco(error) : ler(supabase);
  },
  async marcarEvento(chave, canal, marcado) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.schema("api").rpc("notification_event_set", { p_event_key: chave, p_channel: canal, p_enabled: marcado });
    return error ? falhaDoBanco(error) : ler(supabase);
  },
  async salvarFiltros(filtros) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase
      .schema("api")
      .rpc("notification_filters_set", { p_pausa_noturna: filtros.pausaNoturna, p_frequencia_resumo: filtros.frequenciaDoResumo });
    return error ? falhaDoBanco(error) : ler(supabase);
  },
};
