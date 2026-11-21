import "server-only";
import { falha, MENSAGENS, ok } from "@/lib/errors";
import type { PortaAlertas } from "./porta";

// Porta vazia (produção, até o MIG-15): nada para ler, e nenhuma escrita é aceita. A tela mostra o estado vazio do
// design, sem dado de mentira e sem "em construção".
const indisponivel = () => falha("INDISPONIVEL", MENSAGENS.INDISPONIVEL);

export const portaAlertasVazia: PortaAlertas = {
  ler: async () => ok(null),
  ligarCanal: async () => indisponivel(),
  alterarCanal: async () => indisponivel(),
  marcarEvento: async () => indisponivel(),
  salvarFiltros: async () => indisponivel(),
};
