import "server-only";
import { falha, ok } from "@/lib/errors";
import { SITUACOES, type Situacao } from "@/features/checkin/schema";
import type { PortaCheckin } from "./porta";
import { gravarSessaoSimulada } from "./sessao-simulada";

// Implementação simulada do check-in, para as telas andarem antes do MIG-13 e do MIG-31. Só dado fictício: os CPFs
// são gerados (dígito verificador válido, ninguém real) e a clínica é a do Simulador ATTA-in.
// Sem estado no servidor (a Vercel não garante a mesma instância entre ações): o cenário vai nos 8 primeiros dígitos
// do desafio, que continua um uuid opaco. Os limites de tentativa e reenvio ficam para a implementação real.

export const CODIGO_SIMULADO = "123456";
const CODIGO_QUE_ESGOTA = "999999"; // simula o 5º erro (código cancelado)

const CENARIOS: Record<string, Situacao> = {
  "52998224725": "seguir", // já tem cadastro na rede
  "11144477735": "cadastro_novo",
  "39053344705": "concluido",
  "86246109071": "cancelado",
  "47382169022": "ausente",
  "21536784982": "divergencia",
};

const CLINICAS: Record<string, string> = { aurora: "Clínica Aurora Estética" };

const desafioDe = (situacao: Situacao) =>
  `${String(SITUACOES.indexOf(situacao)).padStart(8, "0")}${crypto.randomUUID().slice(8)}`;

export const situacaoDe = (desafio: string): Situacao | undefined => SITUACOES[Number(desafio.slice(0, 8))];

export const portaSimulada: PortaCheckin = {
  async clinica(portal) {
    const nomeFantasia = CLINICAS[portal];
    return nomeFantasia ? { nomeFantasia } : null;
  },
  async iniciar(portal, cpf) {
    const situacao = CENARIOS[cpf];
    if (!CLINICAS[portal] || !situacao) return falha("NAO_ENCONTRADO", "Sem atendimento hoje para este CPF.");
    return ok({ desafio: desafioDe(situacao), finalCelular: "4321" });
  },
  async confirmar(desafio, codigo) {
    const situacao = situacaoDe(desafio);
    if (!situacao) return falha("NAO_ENCONTRADO", "Código vencido.");
    if (codigo === CODIGO_QUE_ESGOTA) return falha("LIMITE", "Tentativas esgotadas.");
    if (codigo !== CODIGO_SIMULADO) return falha("CONFLITO", "Código não confere.");
    if (situacao === "seguir" || situacao === "cadastro_novo") await gravarSessaoSimulada(desafio);
    return ok({ situacao });
  },
  async reenviar(desafio) {
    if (!situacaoDe(desafio)) return falha("NAO_ENCONTRADO", "Código vencido.");
    return ok({ finalCelular: "4321" });
  },
};
