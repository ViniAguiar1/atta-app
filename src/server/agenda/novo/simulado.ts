import "server-only";
import { falhaDeValidacao, ok } from "@/lib/errors";
import { filtroDosHorariosSchema, type HorariosLivres } from "@/features/agenda/novoAgendamento";
import { hojeNaClinica } from "../simulado";
import type { PortaNovoAgendamento } from "./porta";

// Modal simulado (prévia, local e CI) até o PR A do Backend 2. Só dado fictício: os profissionais da Agenda simulada,
// com conselho inventado. Horário do profissional de segunda a sábado, 08:00–12:00 e 13:00–18:00 (pausa do almoço);
// domingo fechado. Passos de 1 h onde a duração inteira cabe na janela; hoje, só horários futuros (fuso da clínica).

const FUSO = "America/Sao_Paulo";
const OFFSET = "-03:00"; // São Paulo sem horário de verão desde 2019
const JANELAS: [number, number][] = [
  [8 * 60, 12 * 60],
  [13 * 60, 18 * 60],
];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const minutosAgoraNaClinica = (agora: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(agora)
    .split(":")
    .map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const diaDaSemana = (dataLocal: string) => new Date(`${dataLocal}T12:00:00Z`).getUTCDay();
const somarDias = (dataLocal: string, n: number) => {
  const d = new Date(`${dataLocal}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Horários do dia em ISO com o offset da clínica; vazio no domingo e nos dias que já passaram. */
export function horariosDoDia(dataLocal: string, duracaoMin: number, agora = new Date()): string[] {
  const hoje = hojeNaClinica(agora);
  if (dataLocal < hoje || diaDaSemana(dataLocal) === 0) return [];
  const piso = dataLocal === hoje ? minutosAgoraNaClinica(agora) : -1;
  const horarios: string[] = [];
  for (const [inicio, fim] of JANELAS) {
    for (let m = inicio; m + duracaoMin <= fim; m += 60) if (m > piso) horarios.push(`${dataLocal}T${hhmm(m)}:00${OFFSET}`);
  }
  return horarios;
}

export function criarPortaNovoAgendamentoSimulada(agora: () => Date = () => new Date()): PortaNovoAgendamento {
  return {
    async profissionais() {
      return ok([
        { vinculoId: id(901), nome: "Dra. Helena Prado", conselho: "CRM/SP 000001" },
        { vinculoId: id(902), nome: "Dr. Caio Andrade", conselho: "CRO/SP 000002" },
      ]);
    },
    async duracoes() {
      return ok({ consulta: 60, avaliacao: 30, retorno: 30 });
    },
    async horariosLivres(filtro) {
      const lido = filtroDosHorariosSchema.safeParse(filtro);
      if (!lido.success) return falhaDeValidacao(lido.error.issues);
      const { dataLocal, duracaoMin } = lido.data;
      const horarios = horariosDoDia(dataLocal, duracaoMin, agora());
      let proximoLivre: HorariosLivres["proximoLivre"] = null;
      for (let n = 1; !horarios.length && !proximoLivre && n <= 60; n++) {
        const outro = somarDias(dataLocal, n);
        const primeiro = horariosDoDia(outro, duracaoMin, agora())[0];
        if (primeiro) proximoLivre = { dataLocal: outro, inicio: primeiro };
      }
      return ok({ dataLocal, fuso: FUSO, horarios, primeiroLivre: horarios[0] ?? null, proximoLivre });
    },
    async buscarPaciente() {
      return ok([]); // a busca já é real (api.patient_search); a simulada não inventa paciente
    },
  };
}

export const portaNovoAgendamentoSimulada = criarPortaNovoAgendamentoSimulada();
