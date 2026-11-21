import "server-only";
import { ok } from "@/lib/errors";
import { PAINEL_VAZIO } from "@/features/metricas/schema";
import type { PortaMetricas } from "./porta";

// Porta vazia de Métricas (regra de stage do Tech Lead Frontend, 20/11): na produção, enquanto o MIG-16 não traz a
// leitura real, o Painel abre no estado vazio do design. Todos os números nulos ("—" na tela), nada inventado.
export const portaMetricasVazia: PortaMetricas = {
  async painel() {
    return ok(PAINEL_VAZIO);
  },
};
