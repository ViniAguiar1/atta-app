// Textos de Configurações › Notificações (PDD v206 §10.4.6; Simulador ATTA-in, captura 45 e
// simulador/45-config-notificacoes-completa.md). Regra e nomes dos eventos: PDD (decisão do CTO, 21/11, R33). Layout e
// textos de interface: simulador. O e-mail e o número de exemplo do simulador não entram (stage = produção).
import type { CategoriaDeEvento, ChaveDeEvento, FrequenciaDoResumo } from "@/server/alertas/tipos";

export const textos = {
  titulo: "Notificações", // PDD §10.4.6 (só para leitor de tela: o menu já mostra a seção)
  estado: "configurações de notificação", // provisório (rótulo do DataState para leitor de tela)
  vazio: {
    titulo: "Nenhum canal de alerta configurado", // provisório
    texto: "Os canais e os eventos que avisam a equipe fora do sistema aparecem aqui.", // provisório
  },
  canais: {
    titulo: "Canais disponíveis", // simulador
    subtitulo: "Por onde a equipe recebe os alertas", // simulador
    quemRecebe: "ADMIN e COLABORADOR recebem", // simulador (chip)
    sino: { nome: "Sino de Atividades", estado: "Sempre ativo" }, // PDD §10.4.6 / simulador
    ativo: "Ativo", // simulador
    desligado: "Desligado", // simulador
    ligarFalado: (canal: string) => `Receber alertas por ${canal}`, // provisório (nome acessível da caixa)
    email: {
      nome: "E-mail", // PDD §10.4.6
      campo: "E-mail que recebe os alertas", // simulador
      cadastrado: (mascarado: string) => `E-mail cadastrado: ${mascarado}`, // provisório (a leitura só traz o mascarado)
    },
    whatsapp: {
      nome: "WhatsApp", // PDD §10.4.6
      campo: "Número da equipe (com DDD)", // simulador
      cadastrado: (mascarado: string) => `Número cadastrado: ${mascarado}`, // provisório
      ajuda: "Ligue o canal para editar. Os checkboxes de WhatsApp da tabela ficam desabilitados enquanto ele estiver desligado.", // simulador
    },
  },
  eventos: {
    titulo: "Eventos configuráveis", // simulador
    subtitulo: (eventos: number, categorias: number) => `${eventos} eventos em ${categorias} categorias`, // simulador
    contagem: (canal: string, marcados: number, total: number) => `${canal}: ${marcados} de ${total}`, // simulador (chips)
    texto:
      "O sino recebe todos os eventos. Marque por qual canal adicional cada um também chega; a coluna fica desabilitada quando o canal está desligado (as marcações ficam guardadas).", // simulador
    legenda: "Eventos e canais de alerta", // provisório (legenda da tabela, só para leitor de tela)
    colunas: { evento: "Evento", email: "E-mail", whatsapp: "WhatsApp", consome: "(consome mensagem)", desligado: "(desligado)" }, // simulador
    marcarFalado: (evento: string, canal: string) => `${evento} por ${canal}`, // provisório (nome acessível de cada caixa)
    categorias: {
      checkin_atendimentos: "Check-in & Atendimentos", // PDD §10.4.6
      documentos_modelos: "Documentos & Modelos", // PDD §10.4.6
      sistema_conta: "Sistema & Conta", // PDD §10.4.6
    } satisfies Record<CategoriaDeEvento, string>,
    nomes: {
      checkin_iniciado: "Paciente iniciou check-in", // PDD §10.4.6
      checkin_concluido: "Check-in concluído", // PDD §10.4.6
      documento_assinado: "Documento assinado", // PDD §10.4.6
      paciente_atrasado: "Paciente atrasado", // PDD §10.4.6
      atendimento_sem_documento: "Atendimento sem documento vinculado", // PDD §10.4.6
      novo_modelo: "Novo modelo de documento criado", // PDD §10.4.6
      documento_vencendo: "Documento prestes a vencer", // PDD §10.4.6
      documentos_procedimento_atualizados: "Documentos vinculados a um procedimento atualizados", // PDD §10.4.6
      membro_convidado: "Novo membro de equipe convidado", // PDD §10.4.6
      limite_documentos_90: "Limite de documentos atingido (90%)", // PDD §10.4.6
    } satisfies Record<ChaveDeEvento, string>,
    ajudas: {
      paciente_atrasado: "Não iniciou o check-in 15 min após o horário", // PDD §10.4.6
    } as Partial<Record<ChaveDeEvento, string>>,
  },
  filtros: {
    titulo: "Filtros de produtividade & silêncio", // simulador (PDD: "Filtros de Produtividade & Silêncio")
    subtitulo: "Quando os canais adicionais ficam quietos", // simulador
    foraDaPausa: "Fora da pausa noturna", // simulador (chip)
    naPausa: "Na pausa noturna", // provisório (chip, durante a pausa)
    texto: "A pausa e o resumo valem para e-mail e WhatsApp; o sino segue em tempo real.", // simulador
    pausa: "Pausa noturna (22h–07h)", // simulador (PDD: "não notificar entre 22h e 07h")
    frequencia: "Frequência do resumo operacional", // PDD §10.4.6
    opcoes: { tempo_real: "Tempo real", diario: "Diário consolidado", semanal: "Semanal consolidado" } satisfies Record<FrequenciaDoResumo, string>, // PDD §10.4.6
    ajudas: {
      tempo_real: "Cada evento marcado vira um envio imediato.", // simulador
      diario: "Os eventos marcados chegam juntos, num resumo por dia.", // provisório
      semanal: "Os eventos marcados chegam juntos, num resumo por semana.", // provisório
    } satisfies Record<FrequenciaDoResumo, string>,
  },
  salvo: "Salvo", // provisório (anúncio para leitor de tela)
  erros: {
    email: "Informe um e-mail válido, como nome@clinica.com.br.", // provisório
    numero: "Informe o celular com DDD, como (11) 91234-5678.", // provisório
    semDestino: "Informe o destino para ligar o canal.", // provisório (ATTA-IN-0003:address)
    canalDesligado: "Ligue o canal para trocar o destino.", // provisório (ATTA-IN-0003:estado; simulador: "Ligue o canal para editar")
    SEM_PERMISSAO: "Só o gestor da clínica muda as Configurações.", // provisório (o mesmo de Configurações › Agendamentos)
    outro: "Não conseguimos salvar agora. Tente de novo em instantes.", // provisório (o mesmo de Configurações › Agendamentos)
  },
} as const;
