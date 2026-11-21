import "server-only";
import { ok } from "@/lib/errors";
import { painelDeMetricasSchema, type PainelDeMetricas } from "@/features/metricas/schema";
import type { PortaMetricas } from "./porta";

// Métricas simuladas, para a tela andar antes do MIG-16 e para a prova de pixel perfect contra a captura 40 (números da
// mesma ordem de grandeza). Só número fictício e agregado, nenhuma pessoa; sem dica na tela (regra do stage). Passa pelo
// mesmo schema que a real vai usar, para o contrato não divergir.
const PAINEL: PainelDeMetricas = painelDeMetricasSchema.parse({
  atendimentosValidosHoje: 3,
  tempoMedioCheckin: { mediaSegundos: 207, hojeSegundos: 150 },
  tempoOperacionalSalvoHoras: 156,
  atendimentosExtrasMes: 213,
  documentosAssinadosMes: 665,
  formulariosDeSaudeMes: 433,
  preparacaoPrevia: { prontos: 2, total: 2 },
  temposDeHoje: { checkinSegundos: 150, recepcaoSegundos: null, medianaSegundos: 150, p90Segundos: 174 },
});

export const portaMetricasSimulada: PortaMetricas = {
  async painel() {
    return ok(PAINEL);
  },
};
