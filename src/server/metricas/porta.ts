import "server-only";
import type { Resultado } from "@/lib/errors";
import type { PainelDeMetricas } from "@/features/metricas/schema";
import { portaMetricasSimulada } from "./simulado";
import { portaMetricasVazia } from "./vazia";

// Contrato entre o Painel de Métricas (MIG-46, Frontend) e o domínio de métricas (MIG-16, Backend 4). Os números chegam
// prontos e agregados do banco, no fuso da clínica (PDD §10.5: contagens e tempos, nunca conteúdo clínico); a tela só
// formata. A real chama o api.* do MIG-16 com a sessão do usuário (cliente de servidor, nunca a secret key) e passa a
// resposta pelo painelDeMetricasSchema; os nomes dos campos fecham com o Backend 4 quando o MIG-16 abrir.
// Condição da Segurança (#201) para a real: a guarda do layout não basta (o layout não roda a cada navegação e a página
// renderiza em paralelo); a função em api confere has_permission('metrics', 'view') e responde 42501 a quem não tem,
// com teste pgTAP do Colaborador sem a permissão.
export type PortaMetricas = {
  /** Cards e blocos do Painel (§10.5.1 e §10.5.2). Só o ADMIN chega aqui (a rota devolve os outros ao painel). */
  painel(): Promise<Resultado<PainelDeMetricas>>;
};

/**
 * Escolha da porta, só aqui e nunca na tela (regra de stage do Tech Lead Frontend, o modelo do src/server/agenda):
 * sem leitura real ainda, a produção usa a vazia (o estado vazio do design, sem dado de mentira) e a prévia, o local e
 * o CI usam a simulada, só com número fictício e sem dica na tela. Quando o MIG-16 entrar, a real passa a valer em todos.
 */
export function escolherPortaMetricas(ambiente = process.env.VERCEL_ENV): PortaMetricas {
  return ambiente === "production" ? portaMetricasVazia : portaMetricasSimulada;
}

export const portaMetricas: PortaMetricas = escolherPortaMetricas();
