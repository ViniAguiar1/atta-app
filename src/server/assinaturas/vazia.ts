import "server-only";
import { falha, MENSAGENS, ok } from "@/lib/errors";
import type { PortaAssinaturas } from "./porta";

// Porta vazia (produção, até o backend do Backend 6): nada para ler e nenhuma escrita aceita; a tela mostra o estado
// vazio do design, sem dado de mentira.
export const portaAssinaturasVazia: PortaAssinaturas = {
  ler: async () => ok(null),
  salvarModelo: async () => falha("INDISPONIVEL", MENSAGENS.INDISPONIVEL),
};
