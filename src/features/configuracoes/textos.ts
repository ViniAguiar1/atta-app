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
    subtitulo: "Quando marcar o paciente como ausente", // simulador (captura 03)
    campo: "Marcar o paciente como ausente quando não fizer o check-in até", // simulador
    opcao: (min: number) => (min === 0 ? "Não marcar automaticamente" : min % 60 === 0 ? `${min / 60} h depois do horário` : `${min} min depois do horário`), // simulador ("2 h depois do horário"); o 0 é provisório
    texto: // simulador
      "Vale para o QR Code (presencial) e para o Link Check-in Online. Antes disso, o paciente aparece como Atrasado a partir do horário marcado. Quem chegar depois pode ter o preenchimento reaberto.",
  },
  fluxo: {
    titulo: "Fluxo alternativo", // simulador (captura 03)
    subtitulo: "Check-in para quem está sem celular", // simulador
    texto: // simulador
      "Alternativa digital para o paciente sem o próprio celular: a recepção envia o link do check-in a um celular da clínica. O Fluxo impresso fica sempre disponível na agenda.",
    habilitar: "Habilitar o Fluxo alternativo nesta clínica", // simulador
    habilitado: "Habilitado: a agenda mostra os botões Fluxo alternativo e Fluxo impresso.", // simulador
    celulares: "Celulares que recebem o link", // simulador
    celularesTexto: // simulador
      "A clínica cadastra e valida o número e responde por ele. Com um só celular cadastrado, a recepção não precisa escolher; com mais de um, escolhe a cada envio.",
    nenhum: "Nenhum celular cadastrado.", // provisório
    nome: (n: number) => `Nome do celular ${n}`, // simulador (README)
    numero: (n: number) => `Número do celular ${n}`, // simulador (README)
    exemploDeNome: "Celular da recepção", // simulador (README: "ex.: Celular da recepção")
    remover: "Remover", // simulador
    removerFalado: (nome: string) => `Remover ${nome}`, // provisório (rótulo para leitor de tela)
    numeroFalado: (final: string) => `celular terminado em ${final}`, // provisório (o leitor de tela não lê a máscara)
    adicionar: "+ Adicionar celular", // simulador
    salvarCelular: "Salvar celular", // provisório (o número volta mascarado: o novo celular é salvo de uma vez)
    cancelar: "Cancelar", // provisório
    erros: {
      nome: "Dê um nome ao celular, com até 40 caracteres.", // provisório
      numero: "Informe o celular com DDD, como (11) 91234-5678.", // provisório
      LIMITE: "A clínica pode cadastrar até 10 celulares.", // provisório
    },
  },
  envio: {
    titulo: "Envio das mensagens", // simulador (README)
    texto: // simulador (README, "Envio das mensagens")
      "WhatsApp pela API oficial, com SMS como alternativa quando o WhatsApp falhar. Cada envio fica registrado com horário, canal, autor e resultado.",
  },
  perfil: {
    titulo: "Perfil da Clínica", // simulador, captura 42 (h2 só para leitor de tela: o menu lateral já marca a seção)
    rotulo: "Perfil da Clínica", // leitor de tela, enquanto carrega
    vazio: { titulo: "O perfil da clínica aparece aqui", texto: "Os dados da empresa, do gestor e do Responsável Técnico ficam nesta seção." }, // provisório
    faixa: {
      destaque: "Sem botão de salvar.", // simulador, captura 42
      texto: "Cada campo é salvo sozinho. Nome fantasia, CNPJ e Responsável Técnico aparecem no selo ATTA Sign: o que você alterar vale para os documentos assinados daqui para frente. Os já assinados não mudam.", // simulador, captura 42
    },
    salvoEm: (hora: string) => `Último salvamento às ${hora}.`, // provisório (PDD §10.4.1: "horário do último salvamento")
    faltam: "Para consolidar documentos, falta preencher:", // provisório (PDD §10.4.1: aviso dos obrigatórios no topo)
    salvoAs: (hora: string) => `Salvo às ${hora}.`, // provisório
    obrigatorio: "obrigatório", // provisório (leitor de tela)
    empresa: {
      titulo: "Dados da empresa", // simulador, captura 42
      subtitulo: "Como a clínica aparece para o paciente e nos documentos", // simulador, captura 42
      desde: (data: string) => `Clínica desde ${data}`, // simulador, captura 42
    },
    contato: {
      titulo: "Endereço & Contato", // PDD §10.4.1
      subtitulo: "Onde fica a clínica e como o paciente fala com ela", // provisório
    },
    campos: {
      trade_name: { rotulo: "Nome fantasia", ajuda: "Aparece no celular do paciente e na chancela." }, // simulador, captura 42
      legal_name: { rotulo: "Razão social", ajuda: "Como consta no CNPJ." }, // simulador, captura 42
      cnpj: { rotulo: "CNPJ" }, // simulador, captura 42
      tax_registration: { rotulo: "Inscrição estadual/municipal (opcional)" }, // simulador, captura 42
      main_specialty: { rotulo: "Especialidade principal" }, // simulador, captura 42
      address_cep: { rotulo: "CEP" }, // PDD §10.4.1
      address_street: { rotulo: "Rua" }, // PDD §10.4.1
      address_number: { rotulo: "Número" }, // PDD §10.4.1
      address_complement: { rotulo: "Complemento (opcional)" }, // PDD §10.4.1
      address_city: { rotulo: "Cidade" }, // PDD §10.4.1
      address_uf: { rotulo: "UF" }, // PDD §10.4.1
      phone: { rotulo: "Telefone fixo (opcional)" }, // PDD §10.4.1
      clinic_whatsapp: { rotulo: "WhatsApp da clínica", ajuda: "O mesmo número do Aviso de Privacidade." }, // PDD §10.4.1 (RN-AVP-03, sem o código)
      commercial_email: { rotulo: "E-mail comercial" }, // PDD §10.4.1 (obrigatório: decisão do CTO, R35)
    },
    // o que falta, pelo missing_required do banco (os nomes do contrato)
    faltando: {
      trade_name: "Nome fantasia",
      legal_name: "Razão social",
      cnpj: "CNPJ",
      address: "Endereço",
      clinic_whatsapp: "WhatsApp da clínica",
      commercial_email: "E-mail comercial",
      manager: "Gestor da clínica",
      technical_lead: "Responsável Técnico",
    } as Record<string, string>, // PDD §10.4.1 e decisão do CTO (R35)
    // CNPJ e Razão social: só o 1º preenchimento; depois, a troca é ação protegida (PDD §10.4.3; contrato do TL, ADR 0001)
    protegido: "Para trocar, peça ao suporte ATTA: a alteração passa por conferência.", // provisório (textos-para-a-po.md)
    erros: {
      protegido: "Este dado já foi informado. Para trocar, peça ao suporte ATTA.", // provisório
      VALIDACAO: "Confira este campo: o valor não foi aceito.", // provisório
      cnpj: "Confira o CNPJ: os dígitos não conferem.", // provisório
      email: "Confira o e-mail: falta o @ ou o domínio.", // provisório (PDD §16.6: estrutura válida)
      SEM_PERMISSAO: "Só o gestor da clínica muda o Perfil.", // provisório
      INDISPONIVEL: "Não conseguimos salvar agora. Tente de novo em instantes.", // provisório
    },
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
