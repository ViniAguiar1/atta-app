import "server-only";
import { ok } from "@/lib/errors";
import type { LeituraDoFormulario, Pergunta } from "@/lib/saude/schema";
import type { PortaSaude } from "./porta";

// Formulário de Saúde simulado até o MIG-22 (Backend 3), só fora da produção. Perguntas e respostas inventadas, de ninguém,
// para a tela e o Boarding Check andarem. Sem estado: salvar só confirma, e declarar devolve 'ok'. Nunca dica na tela.
const P = {
  alergia: "5d1f7a3e-1b2c-4d3e-8f4a-0a1b2c3d4e01",
  medicamento: "5d1f7a3e-1b2c-4d3e-8f4a-0a1b2c3d4e02",
  procedimento: "5d1f7a3e-1b2c-4d3e-8f4a-0a1b2c3d4e03",
  observacao: "5d1f7a3e-1b2c-4d3e-8f4a-0a1b2c3d4e04",
} as const;

const PERGUNTAS: Pergunta[] = [
  {
    id: P.alergia,
    texto: "Possui alguma alergia?",
    tipo: "sim_nao",
    obrigatoria: true,
    subOpcoes: {
      quando: "sim",
      opcoes: [
        { id: "latex", rotulo: "Látex" },
        { id: "dipirona", rotulo: "Dipirona" },
        { id: "iodo", rotulo: "Iodo" },
      ],
      permiteDigitar: true,
    },
  },
  { id: P.medicamento, texto: "Usa algum medicamento de uso contínuo?", tipo: "sim_nao", obrigatoria: true },
  {
    id: P.procedimento,
    texto: "Já fez algum destes procedimentos?",
    tipo: "opcoes",
    obrigatoria: false,
    opcoes: [
      { id: "peeling", rotulo: "Peeling" },
      { id: "preenchimento", rotulo: "Preenchimento" },
      { id: "laser", rotulo: "Laser" },
    ],
    permiteOutro: true,
  },
  { id: P.observacao, texto: "Quer contar mais alguma coisa à profissional?", tipo: "aberta", obrigatoria: false },
];

const LEITURA: LeituraDoFormulario = {
  perguntas: PERGUNTAS,
  respostas: [
    { perguntaId: P.alergia, recusada: false, valor: { tipo: "sim_nao", valor: true, subOpcoes: ["latex"], digitadas: ["Esparadrapo"] } },
    { perguntaId: P.medicamento, recusada: false, valor: { tipo: "sim_nao", valor: false } },
    { perguntaId: P.procedimento, recusada: true },
    { perguntaId: P.observacao, recusada: false, valor: { tipo: "aberta", texto: "Prefiro atendimento pela manhã." } },
  ],
  destaques: { [P.alergia]: "Atenção da clínica: alergia informada" },
  declaradoEm: "2026-11-21T13:05:00.000Z",
};

export const portaSaudeSimulada: PortaSaude = {
  async carregar() {
    return ok({
      perguntas: PERGUNTAS,
      // "Pergunta a pergunta": a alergia já foi respondida antes (em qualquer clínica), as outras são novas
      anteriores: { [P.alergia]: { valor: { tipo: "sim_nao", valor: true, subOpcoes: ["latex"] }, respondidaEm: { mes: 3, ano: 2026 } } },
      rascunho: [],
    });
  },
  async salvarResposta() {
    return ok({ salvoEm: new Date().toISOString() });
  },
  async declarar() {
    return ok({ status: "ok" as const });
  },
  async lerParaBoarding() {
    return ok(LEITURA);
  },
};
