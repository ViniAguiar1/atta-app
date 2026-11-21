import type { Acao, Status } from "@/lib/agenda/linha";

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
  acoes: {
    editar: "Editar", // PDD §10.2.2
    confirmar: "Confirmar agendamento", // PDD §10.2.1 e §10.2.2
    remarcar: "Remarcar", // PDD §10.2.2
    link: "Link", // PDD §10.2.2
    marcar_ausente: "Marcar como ausente", // PDD §10.2.2
    fluxo_alternativo: "Fluxo alternativo", // PDD §10.2.2
    fluxo_impresso: "Fluxo impresso", // PDD §10.2.2
    reenviar_boarding_check: "Reenviar Boarding Check ao profissional", // PDD §10.2.2
    concluir_pela_recepcao: "Concluir pela recepção", // PDD §10.2.2 e §10.2.3
    envios_dos_links: "Envios dos links", // PDD §10.2.2
    enviar_termos: "Enviar termos ao paciente", // PDD §10.2.2
    reabrir_preenchimento: "Reabrir preenchimento", // PDD §10.2.2
    detalhes: "Detalhes", // PDD §10.2.2
    cancelar: "Cancelar agendamento", // PDD §10.2.2
  } satisfies Record<Acao, string>,
  menu: {
    abrir: (paciente: string) => `Ações de ${paciente}`, // provisório (nome do botão ⋮ para o leitor de tela)
  },
  /** motivo da ação desabilitada (disabled_reason do banco); sem texto próprio, o genérico */
  desabilitada: {
    edit_after_checkin: "Só dá para editar antes do check-in começar", // simulador, captura 01
    fora_da_janela: "Disponível só dentro da janela de confirmação", // provisório
    padrao: "Indisponível neste momento", // provisório
  } as Record<string, string>,
} as const;
