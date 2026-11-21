import "server-only";
import { falhaDeValidacao, ok } from "@/lib/errors";
import { filtroDosHorariosSchema } from "@/features/agenda/novoAgendamento";
import type { PortaNovoAgendamento } from "./porta";

// Modal na produção antes do PR A do Backend 2 (regra de stage): nenhum profissional e nenhum horário, sem dado de
// mentira; a tela mostra o vazio de cada campo. As durações são os padrões da PO (PDD §10.2, "Duração do atendimento"),
// não dado simulado: valem até a configuração da clínica chegar pelo api.agenda_durations.
export const portaNovoAgendamentoVazia: PortaNovoAgendamento = {
  async profissionais() {
    return ok([]);
  },
  async duracoes() {
    return ok({ consulta: 60, avaliacao: 30, retorno: 30 });
  },
  async horariosLivres(filtro) {
    const lido = filtroDosHorariosSchema.safeParse(filtro);
    if (!lido.success) return falhaDeValidacao(lido.error.issues);
    return ok({ dataLocal: lido.data.dataLocal, fuso: "America/Sao_Paulo", horarios: [], primeiroLivre: null, proximoLivre: null });
  },
  async buscarPaciente() {
    return ok([]);
  },
};
