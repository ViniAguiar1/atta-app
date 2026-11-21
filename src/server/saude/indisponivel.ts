import "server-only";
import { falha } from "@/lib/errors";
import type { PortaSaude } from "./porta";

// Produção sem o MIG-22: nenhum dado de saúde, nem simulado. Todas as chamadas respondem INDISPONIVEL; a tela mostra o
// estado de erro (e /ficha/** já dá 404 na produção pelo moduloDisponivel).
const FORA = falha("INDISPONIVEL", "Formulário de Saúde indisponível.");

export const portaSaudeIndisponivel: PortaSaude = {
  carregar: async () => FORA,
  salvarResposta: async () => FORA,
  declarar: async () => FORA,
  lerParaBoarding: async () => FORA,
};
