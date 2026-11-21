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
  /** motivos em lista fechada (Regra Transversal 3: sem texto livre); rótulos do PDD */
  motivos: {
    cancelado_pelo_paciente: "Cancelado pelo paciente", // PDD §10.2.2
    cancelado_pela_clinica: "Cancelado pela clínica", // PDD §10.2.2
    agendado_por_engano: "Agendado por engano", // PDD §10.2.2
    paciente_desistiu: "Paciente desistiu do procedimento", // PDD §10.2.2 (🔵 proposto)
    contraindicacao_identificada: "Contraindicação identificada", // PDD §10.2.2 (🔵 proposto)
    paciente_solicitou_cancelamento: "Paciente solicitou cancelamento", // PDD §10.2.2 (🔵 proposto)
    conflito_agenda_profissional: "Conflito de agenda do profissional", // PDD §10.2.2 (🔵 proposto)
    indisponibilidade_insumo: "Indisponibilidade de insumo/material necessário", // PDD §10.2.2 (🔵 proposto)
    profissional_inacessivel: "Profissional inacessível", // PDD §10.2.3
    emergencia_clinica: "Emergência clínica", // PDD §10.2.3
    falha_tecnica_no_acesso: "Falha técnica no acesso", // PDD §10.2.3
  } as Record<string, string>,
  dialogo: {
    motivo: "Motivo", // PDD §10.2.2 e §10.2.3 ("motivo obrigatório")
    voltar: "Voltar", // provisório
    escolhaMotivo: "Escolha um motivo.", // provisório
    cancelar: {
      titulo: "Cancelar agendamento", // PDD §10.2.2
      texto: "Escolha o motivo. O cancelamento fica registrado na auditoria, com o seu nome e o horário.", // provisório
      confirmar: "Cancelar agendamento", // PDD §10.2.2
    },
    concluir: {
      titulo: "Concluir pela recepção", // PDD §10.2.3
      texto:
        "Use só quando o profissional não puder concluir pelo Boarding Check. Fica registrado com o seu nome, o motivo e a justificativa.", // provisório (PDD §10.2.3)
      justificativa: "Justificativa", // PDD §10.2.3
      faltam: (n: number) => `Faltam ${n} ${n === 1 ? "caractere" : "caracteres"}`, // provisório (PDD §10.2.3: contagem regressiva)
      atingido: "Mínimo de 50 caracteres atingido", // provisório
      confirmar: "Concluir atendimento", // provisório
    },
  },
  /** motivo da ação desabilitada (disabled_reason do banco); sem texto próprio, o genérico */
  desabilitada: {
    edit_after_checkin: "Só dá para editar antes do check-in começar", // simulador, captura 01
    fora_da_janela: "Disponível só dentro da janela de confirmação", // provisório
    padrao: "Indisponível neste momento", // provisório
  } as Record<string, string>,
} as const;
