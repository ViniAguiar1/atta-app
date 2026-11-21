import type { Status } from "@/lib/agenda/linha";

// Textos dos componentes de domínio da agenda (src/components/agenda), comuns à Agenda e à Pasta do Paciente.
// Cada linha diz a origem: // PDD §x.y. Dono: Frontend 4.
export const textosDaAgenda = {
  status: {
    agendado: "Agendado", // PDD §10.2.2
    em_preenchimento: "Em preenchimento", // PDD §10.2.2
    pronto: "Pronto", // PDD §10.2.2
    em_atendimento: "Em atendimento", // PDD §10.2.2
    concluido: "Concluído", // PDD §10.2.2
    ausente: "Ausente", // PDD §10.2.2
    cancelado: "Cancelado", // PDD §10.2.2
  } satisfies Record<Status, string>,
  atrasado: "Atrasado", // PDD §10.2.2 (selo ao lado do status)
} as const;
