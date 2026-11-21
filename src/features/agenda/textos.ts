import { textosDaAgenda } from "@/components/agenda/textos";
import type { EstadoDoDocumento } from "./schema";

// Textos da Agenda (MIG-41). Cada linha diz a origem: // PDD §x.y, // simulador (PDD omisso; captura 01 ou 06) ou
// // provisório (nem PDD nem simulador; listado ao CTO para o textos-para-a-po.md).
/** Número que ainda não existe (porta vazia, sem leitura real): o traço do design (ORDEM do Tech Lead Frontend). */
export const SEM_NUMERO = "—";

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
  vazioDa: {
    hoje: { titulo: "Nenhum agendamento hoje", texto: "Os agendamentos do dia aparecem aqui." }, // provisório
    todos: { titulo: "Nenhum agendamento", texto: "Os agendamentos de hoje em diante aparecem aqui." }, // provisório
    concluidos: { titulo: "Nenhum atendimento concluído", texto: "Os atendimentos concluídos no período aparecem aqui." }, // provisório
  },
  naoRealizado: "Não realizado", // PDD §10.2.2 (Ausente na visão Concluídos)
  realizado: "Realizado", // simulador, captura 36 (procedimento realizado no Concluído)
  rodape: {
    todos: (n: number) => `${n} ${n === 1 ? "agendamento" : "agendamentos"}`, // simulador, captura 35
    concluidos: (n: number) => `${n} ${n === 1 ? "registro" : "registros"} · atendimentos mais antigos ficam na Pasta do Paciente`, // simulador, captura 36
  },
  confirmacao: {
    titulo: "Confirmação", // PDD §10.2.2 (card da visão Todos)
    agendados: "Agendados", // PDD §10.2.2
    aConfirmar: "A confirmar", // PDD §10.2.2
    confirmados: "Confirmados", // PDD §10.2.2
  },
  visoes: {
    rotulo: "Visões da agenda", // provisório (nome do grupo para o leitor de tela)
    hoje: "Hoje", // PDD §10.2.2
    todos: "Todos", // PDD §10.2.2
    concluidos: "Concluídos", // PDD §10.2.2
  },
  cards: {
    rotulo: "Resumo do dia", // provisório (nome da região para o leitor de tela)
    hoje: {
      titulo: "Agendamentos hoje", // PDD §10.2.2
      concluidos: (n: number | null) => `${n ?? SEM_NUMERO} ${n === 1 ? "concluído" : "concluídos"}`, // simulador, captura 01 ("1 concluído"); plural provisório
    },
    mes: {
      titulo: "Agendamentos no mês", // PDD §10.2.2
      concluidos: "concluídos no mês", // PDD §10.2.2; simulador, captura 01
      livres: "horários livres na agenda", // PDD §10.2.2; simulador, captura 01
    },
    checkin: {
      titulo: "Check-in", // PDD §10.2.2
      filtrar: (estado: string, n: number | null) => `${estado}: ${n ?? SEM_NUMERO}. Filtrar a lista`, // provisório (leitor de tela)
    },
    semDocumento: {
      titulo: "Sem documento vinculado", // PDD §10.2.2
      texto: "Vincule antes do horário", // simulador, captura 01 (PDD omisso)
      filtrar: (n: number | null) => `Sem documento vinculado: ${n ?? SEM_NUMERO}. Filtrar a lista`, // provisório (leitor de tela)
    },
  },
  colunas: {
    data: "Data", // PDD §10.2.2 (visões Todos e Concluídos)
    horario: "Horário", // PDD §10.2.2
    paciente: "Paciente", // PDD §10.2.2
    procedimento: "Procedimento", // PDD §10.2.2
    profissional: "Profissional", // PDD §10.2.2
    documentos: "Documentos", // PDD §10.2.2
    status: "Status", // PDD §10.2.2
  },
  status: textosDaAgenda.status, // PDD §10.2.2 (fonte única em src/components/agenda/textos.ts)
  atrasado: textosDaAgenda.atrasado, // PDD §10.2.2
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
