import type { EstadoDoDocumento, Status } from "./schema";

// Textos da Agenda (MIG-41). Cada linha diz a origem: // PDD §x.y, // simulador (PDD omisso; captura 01 ou 06) ou
// // provisório (nem PDD nem simulador; listado ao CTO para o textos-para-a-po.md).
export const textos = {
  titulo: "Agendamentos", // PDD §10.2 (h1 só para o leitor de tela; a aba já mostra o nome)
  rotuloDaLista: "Agendamentos de hoje", // provisório (nome da região para o leitor de tela)
  busca: {
    rotulo: "Buscar por nome ou CPF", // PDD §10.2.2 ("busca por nome ou CPF"); simulador, captura 01
    placeholder: "Buscar por nome ou CPF", // simulador, captura 01
    termoCurto: "Digite ao menos 2 letras do nome ou o CPF completo.", // provisório
  },
  vazio: {
    titulo: "Nenhum agendamento hoje", // provisório (o simulador não tem o estado vazio)
    texto: "Os agendamentos do dia aparecem aqui.", // provisório
  },
  colunas: {
    horario: "Horário", // PDD §10.2.2
    paciente: "Paciente", // PDD §10.2.2
    procedimento: "Procedimento", // PDD §10.2.2
    profissional: "Profissional", // PDD §10.2.2
    documentos: "Documentos", // PDD §10.2.2
    status: "Status", // PDD §10.2.2
  },
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
  confirmado: "Confirmado", // PDD §10.2.1 (rótulo turquesa; o estado continua Agendado)
  confirmarOuCancelar: "Confirmar ou cancelar", // PDD §10.2.1
  boardingCheckEnviado: (hora: string) => `Boarding Check enviado às ${hora}`, // simulador, captura 06
  cpfTerminadoEm: (final: string) => `CPF terminado em ${final}`, // provisório (leitor de tela; ADR 0002 §6)
  semCpf: "Sem CPF", // provisório
  documento: {
    // PDD §10.2.2: bolinha = vinculado, aguardando assinatura; ✓ = assinado; ✗ = assinatura recusada
    vinculado: { simbolo: "●", estado: "aguardando assinatura" }, // PDD §10.2.2
    assinado: { simbolo: "✓", estado: "assinado" }, // PDD §10.2.2
    recusado: { simbolo: "✗", estado: "assinatura recusada" }, // PDD §10.2.2
    opcional: "opcional", // PDD §10.2.2
    nenhum: "Nenhum documento", // simulador, captura 06
  } satisfies Record<EstadoDoDocumento, { simbolo: string; estado: string }> & Record<string, unknown>,
} as const;
