import "server-only";
import type { Resultado } from "@/lib/errors";
import { portaAlertasSimulada } from "./simulado";
import type { AlertasDaEquipe, Canal, ChaveDeEvento, FrequenciaDoResumo } from "./tipos";
import { portaAlertasVazia } from "./vazia";

// Contrato entre Configurações › Notificações (PDD v206 §10.4.6, Frontend 5) e as regras de notificação do MIG-15
// (Backend 4), que ainda não estão na main. O Backend 4 propõe as RPCs e o Tech Lead aprova (pedido em 21/11); esta é a
// forma de que a tela precisa. Exclusivo do ADMIN (§10.4.3: Configurações é sempre do gestor); quem autoriza é o banco.
// Cada escrita devolve o estado inteiro, para a tela ficar igual ao que o banco guardou. Forma aprovada pelo Tech Lead
// (21/11): leitura com o destino só mascarado, troca de destino numa ação própria e recusa com reason estável
// (ATTA-IN-0001:address para formato do destino; ATTA-IN-0003:address para ligar um canal sem destino;
// ATTA-IN-0003:estado para endereço novo com o canal desligado sem ligar junto). RPCs do MIG-15 (Backend 4,
// desenho/mig-15-notificacoes-contrato.md, revisão 2): notification_settings_get, notification_channel_set,
// notification_event_set e notification_filters_set; no banco, os filtros são pausa_noturna e frequencia_resumo.
export type PortaAlertas = {
  /** null = ainda não há configuração legível (porta vazia): a tela mostra o estado vazio do design */
  ler(): Promise<Resultado<AlertasDaEquipe | null>>;
  /** liga ou desliga o canal */
  ligarCanal(canal: Canal, ativo: boolean): Promise<Resultado<AlertasDaEquipe>>;
  /**
   * troca o e-mail ou o número (com DDD). Quem valida o formato é o servidor do Next (Zod), antes de cifrar pelo Cofre
   * (ADR 0002 §6); o banco recebe só o envelope e a máscara e confere a forma. O valor só vai no corpo, nunca no log
   * nem em claro ao banco. `ativar` liga o canal na mesma chamada. Recusas: canal sem destino não liga
   * (ATTA-IN-0003:address); endereço novo com o canal desligado e sem ligar junto (ATTA-IN-0003:estado).
   */
  alterarCanal(canal: Canal, destino: string, ativar?: boolean): Promise<Resultado<AlertasDaEquipe>>;
  /** marca ou desmarca um evento num canal; a marcação fica guardada mesmo com o canal desligado */
  marcarEvento(chave: ChaveDeEvento, canal: Canal, marcado: boolean): Promise<Resultado<AlertasDaEquipe>>;
  salvarFiltros(filtros: { pausaNoturna: boolean; frequenciaDoResumo: FrequenciaDoResumo }): Promise<Resultado<AlertasDaEquipe>>;
};

/**
 * Escolha da porta, só aqui e nunca na tela (regra de stage do Tech Lead Frontend; modelo do #142): sem leitura real,
 * a vazia na produção (sem dado de mentira) e a simulada na prévia, no local e no CI.
 */
export function escolherPortaAlertas(ambiente = process.env.VERCEL_ENV): PortaAlertas {
  return ambiente === "production" ? portaAlertasVazia : portaAlertasSimulada;
}

export const portaAlertas: PortaAlertas = escolherPortaAlertas();
