import "server-only";
import { falha, MENSAGENS, ok } from "@/lib/errors";
import type { PortaServicos } from "./porta";

// Implementação simulada, até a trava do Backend 6 entrar: o Serviço cujo id começa com "b10c" é o único procedimento
// de dois termos Ativos fictícios; o resto sai. Sem estado no servidor.
const BLOQUEADO = /^b10c/;
const TERMOS_FICTICIOS = [
  { templateId: "00000000-0000-4000-8000-0000000000a1", titulo: "Termo de Consentimento Fictício A" },
  { templateId: "00000000-0000-4000-8000-0000000000a2", titulo: "Termo de Consentimento Fictício B" },
];

export const portaServicosSimulada: PortaServicos = {
  async bloqueiosParaExcluir(servicoId) {
    return ok(BLOQUEADO.test(servicoId) ? TERMOS_FICTICIOS : []);
  },
  async excluir(servicoId) {
    if (BLOQUEADO.test(servicoId))
      return falha("CONFLITO", MENSAGENS.CONFLITO, undefined, "ATTA-IN-0004:clinic_service_id");
    return ok(undefined);
  },
};
