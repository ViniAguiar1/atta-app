import "server-only";
import type { Resultado } from "@/lib/errors";
import type { CaixaDeNotificacoes } from "@/features/notificacoes/schema";
import { portaNotificacoesSimulada } from "./simulado";
import { portaNotificacoesVazia } from "./vazia";

// Contrato entre o sino (MIG-45, tela) e o motor de notificações (MIG-15, Backend 4). A real chama o api.* do MIG-15 com
// a sessão do usuário (cliente de servidor, nunca a secret key), passa a resposta pelo caixaSchema e traz só o que o
// perfil pode ver (PDD §21; o que cada perfil vê é a LAC-050, em aberto). Nenhuma notificação traz dado de saúde.
export type PortaNotificacoes = {
  /** As notificações da clínica, mais novas primeiro, e como os canais estão configurados (§10.4.6). */
  caixa(): Promise<Resultado<CaixaDeNotificacoes>>;
};

/**
 * Escolha da porta, só aqui e nunca na tela (regra de stage do Tech Lead Frontend, o modelo do src/server/agenda): sem
 * leitura real ainda, a produção usa a vazia (nenhuma notificação, canais sem configuração) e a prévia, o local e o CI
 * usam a simulada, só com dado fictício e sem dica na tela. Quando o MIG-15 entrar, a real passa a valer em todos.
 */
export function escolherPortaNotificacoes(ambiente = process.env.VERCEL_ENV): PortaNotificacoes {
  return ambiente === "production" ? portaNotificacoesVazia : portaNotificacoesSimulada;
}

export const portaNotificacoes: PortaNotificacoes = escolherPortaNotificacoes();
