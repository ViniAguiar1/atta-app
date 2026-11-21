import "server-only";
import { ok } from "@/lib/errors";
import { CANAIS_VAZIOS } from "@/features/notificacoes/schema";
import type { PortaNotificacoes } from "./porta";

// Porta vazia do sino (regra de stage do Tech Lead Frontend, 20/11): na produção, enquanto o MIG-15 não traz a leitura
// real, a caixa abre no estado vazio do design e os canais sem configuração ("—"). Nada inventado.
export const portaNotificacoesVazia: PortaNotificacoes = {
  async caixa() {
    return ok({ itens: [], canais: CANAIS_VAZIOS });
  },
};
