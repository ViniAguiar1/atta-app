// Textos de Configurações (PDD v206 §10.4). Rótulos e explicações: Simulador ATTA-in (captura 02 e README, "Detalhes
// capturados em 20/11"). O que não está no PDD nem no simulador: provisório, listado ao CTO (textos-para-a-po.md).
export const textos = {
  titulo: "Configurações", // PDD §10.4 (h1 só para leitor de tela: a aba ativa já diz o módulo, PDD §10)
  menu: {
    rotulo: "Seções de Configurações", // provisório
    abrir: "Ver seções", // provisório (menu recolhido abaixo de 840 px)
    fechar: "Fechar seções", // provisório
  },
  agendamentos: {
    titulo: "Agendamentos", // simulador (h2 só para leitor de tela: o menu lateral já marca a seção)
    rotulo: "parâmetros de Agendamentos", // provisório (leitor de tela, enquanto carrega)
    vazio: "Nenhum parâmetro encontrado.", // provisório
  },
  link: {
    titulo: "Link Check-in Online", // simulador
    subtitulo: "Envio, validade e lembretes", // simulador
    texto: // simulador
      "Só para consulta e avaliação online, por WhatsApp. Único, pessoal e sem dado pessoal no endereço. Quem tem ATTA me não recebe link: o preenchimento é liberado dentro do app, na mesma janela.",
    envio: "Enviar o link (horas antes)", // simulador
    validade: "Link vale até (horas depois do horário)", // simulador
    lembrete1: "Primeiro lembrete (min antes)", // simulador
    lembrete2: "Segundo lembrete (min antes)", // simulador
    total: (antes: number, depois: number) => ({
      destaque: `Validade total do link: ${antes + depois} h`, // simulador
      detalhe: ` (${antes} h antes até ${depois} h depois do horário).`, // simulador
    }),
  },
  confirmacao: {
    titulo: "Janela de confirmação", // PDD §10.2.1 ("Janela de confirmação (decisão da PO)")
    texto: // provisório, a partir do PDD §10.2.1
      "Quantas horas antes do horário a confirmação do agendamento fica disponível, para a recepção e para o agente. O Link Check-in Online só sai depois da confirmação.",
    campo: "Abrir a confirmação (horas antes)", // provisório
  },
  ausencia: {
    titulo: "Ausência automática", // simulador
    campo: "Marcar o paciente como ausente quando não fizer o check-in até", // simulador
    opcao: (min: number) => (min === 0 ? "Não marcar automaticamente" : min % 60 === 0 ? `${min / 60} h depois do horário` : `${min} min depois do horário`), // simulador ("2 h depois do horário"); o 0 é provisório
    texto: // simulador
      "Vale para o QR Code (presencial) e para o Link Check-in Online. Antes disso, o paciente aparece como Atrasado a partir do horário marcado. Quem chegar depois pode ter o preenchimento reaberto.",
  },
  salvando: "Salvando…", // provisório
  salvo: "Salvo.", // provisório
  erros: {
    limite: (min: number | null, max: number | null) =>
      min !== null && max !== null ? `Use um valor de ${min} a ${max}.` : "Escolha uma das opções.", // provisório
    numero: "Use só números inteiros.", // provisório
    lembrete_2_min: "O segundo lembrete precisa vir depois do primeiro: use menos minutos que o primeiro lembrete.", // provisório
    lembrete_1_min: "O primeiro lembrete precisa caber no envio do link: use menos minutos que as horas de envio.", // provisório
    conflito: "Este valor não combina com os outros desta seção.", // provisório
    SEM_PERMISSAO: "Só o gestor da clínica muda as Configurações.", // provisório
    outro: "Não conseguimos salvar agora. Tente de novo em instantes.", // provisório
  },
} as const;
