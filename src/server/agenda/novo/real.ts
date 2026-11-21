import "server-only";
import { ok, type Resultado } from "@/lib/errors";
import type { PacienteDoModal } from "@/features/agenda/novoAgendamento";
import { portaPacientes, type LinhaDePaciente, type PortaPacientes } from "@/server/pacientes/porta";
import type { PortaNovoAgendamento } from "./porta";

// Porta real do modal: por ora só a busca do paciente, que reusa a de Pacientes (api.patient_search; contrato, item 5).
// Nome com 2+ letras ou CPF inteiro em HMAC (a porta de Pacientes calcula); o documento e o celular já vêm mascarados.

export function pacienteDoModal(linha: LinhaDePaciente): PacienteDoModal {
  return {
    id: linha.id,
    nome: linha.nome,
    documentoMascarado: linha.identificacao.tipo === "incompleto" ? null : linha.identificacao.mascarado,
    whatsappMascarado: linha.contato?.celular ?? null,
  };
}

export function criarPortaNovoAgendamentoReal(
  pacientes: Pick<PortaPacientes, "buscar"> = portaPacientes,
): Pick<PortaNovoAgendamento, "buscarPaciente"> {
  return {
    async buscarPaciente(termo): Promise<Resultado<PacienteDoModal[]>> {
      const r = await pacientes.buscar(termo);
      return r.ok ? ok(r.data.map(pacienteDoModal)) : r;
    },
  };
}

export const portaNovoAgendamentoReal = criarPortaNovoAgendamentoReal();
