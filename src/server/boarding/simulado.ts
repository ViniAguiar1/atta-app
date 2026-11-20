import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ok } from "@/lib/errors";
import { hashDoSegredo } from "@/server/grant/politica";
import type { PortaBoardingCheck } from "./porta";

// Boarding Check simulado até o MIG-23 (Backend 3). Só dado fictício. Sem estado no servidor (a Vercel não garante a
// mesma instância): vale um link fixo e qualquer sessão gravada pelo PIN certo. Os limites do PIN são do banco; aqui
// só há um PIN que simula o bloqueio. Valores de teste no migracao/guia-de-teste.md, nunca na tela.
export const LINK_SIMULADO = "vale".padEnd(43, "A");
export const PIN_SIMULADO = "2468";
const PIN_QUE_BLOQUEIA = "0000"; // simula o 5º erro seguido
const HASH_DO_LINK = hashDoSegredo(LINK_SIMULADO) as Buffer;
const BLOQUEIO_MS = 15 * 60 * 1000;

export const portaBoardingSimulada: PortaBoardingCheck = {
  async confirmarPin(hashDoLink, pin) {
    if (!timingSafeEqual(hashDoLink, HASH_DO_LINK)) return ok({ status: "indisponivel" });
    if (pin === PIN_QUE_BLOQUEIA) return ok({ status: "bloqueado", bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS).toISOString() });
    return ok({ status: pin === PIN_SIMULADO ? "ok" : "pin_incorreto" });
  },
  async abrir() {
    return ok({
      clinica: "Clínica Aurora Estética",
      paciente: { nome: "Helena Prado Antunes", idade: 34 },
      horario: "10:30",
      tipoDeAtendimento: "Consulta",
      comparecimento: { atendimentos: 3, ausencias: 1 },
    });
  },
  async concluir() {
    return ok({ concluidoEm: new Date().toISOString() });
  },
};
