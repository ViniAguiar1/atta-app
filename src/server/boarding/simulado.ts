import "server-only";
import { randomBytes } from "node:crypto";
import { falha, ok } from "@/lib/errors";
import type { PortaBoardingCheck } from "./porta";

// Boarding Check simulado até o MIG-23 (Backend 3) e o grant (MIG-13a, #30). Só dado fictício. Sem estado no servidor
// (a Vercel não garante a mesma instância): o cenário vai no começo do segredo, que continua com 43 caracteres
// base64url. Os limites do PIN são do banco; aqui só há um PIN que simula o bloqueio. Valores de teste no
// migracao/guia-de-teste.md, nunca na tela.

const PREFIXO_LINK_VALIDO = "vale";
const PREFIXO_SESSAO = "sess";
export const PIN_SIMULADO = "2468";
const PIN_QUE_BLOQUEIA = "0000"; // simula o 5º erro seguido
const BLOQUEIO_MS = 15 * 60 * 1000;

const segredo = (prefixo: string) => prefixo + randomBytes(32).toString("base64url").slice(0, 43 - prefixo.length);

export const portaBoardingSimulada: PortaBoardingCheck = {
  async confirmarPin(segredoDoLink, pin) {
    if (!segredoDoLink.startsWith(PREFIXO_LINK_VALIDO)) return ok({ status: "indisponivel" });
    if (pin === PIN_QUE_BLOQUEIA) return ok({ status: "bloqueado", bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS).toISOString() });
    if (pin !== PIN_SIMULADO) return ok({ status: "pin_incorreto" });
    return ok({ status: "ok", segredoDaSessao: segredo(PREFIXO_SESSAO) });
  },
  async abrir(segredoDaSessao) {
    if (!segredoDaSessao.startsWith(PREFIXO_SESSAO)) return falha("NAO_AUTENTICADO", "Sem sessão do Boarding Check.");
    return ok({
      clinica: "Clínica Aurora Estética",
      paciente: { nome: "Helena Prado Antunes", idade: 34 },
      horario: "10:30",
      tipoDeAtendimento: "Consulta",
      comparecimento: { atendimentos: 3, ausencias: 1 },
    });
  },
  async concluir(segredoDaSessao) {
    if (!segredoDaSessao.startsWith(PREFIXO_SESSAO)) return falha("NAO_AUTENTICADO", "Sem sessão do Boarding Check.");
    return ok({ concluidoEm: new Date().toISOString() });
  },
};
