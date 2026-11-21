// Textos da Central de Ajuda do Módulo ATTA (MIG-48; PDD v206 §10.6.1). Layout e textos de interface do Simulador
// ATTA-in (captura 19 e simulador/atta-modulo-textos.md). Decisões do CTO (20/11): os guias seguem a lista do PDD, no
// cartão do simulador; o FAQ do simulador entra como texto provisório, sem os trechos "a definir"; busca, Dica do Dia,
// Selo e NPS ficam fora até haver design. Os tutoriais (progresso real, Backend 4) entram quando houver a API.
// Todo texto aqui é provisório, salvo onde diz "PDD"; as respostas ajustadas estão marcadas e vão ao textos-para-a-po.md.

export const textosAjuda = {
  faixa: {
    destaque: "Central de Ajuda.", // simulador, captura 19
    texto: "Guias por módulo e respostas para o que foge do roteiro.", // provisório (o simulador cita também os tutoriais, que ainda não entram)
  },
  guias: {
    titulo: "Guias por módulo", // PDD §10.6.1 / simulador, captura 19
    subtitulo: "O que cada módulo do painel faz.", // provisório (o do simulador fala "no simulador")
    // nomes: PDD §10.6.1 (7 guias); descrições: simulador, captura 19 (Métricas: provisório)
    itens: [
      { titulo: "Métricas", texto: "Indicadores da operação e o antes × depois do onboarding." },
      { titulo: "Agendamentos", texto: "Agendar, acompanhar, liberar." },
      { titulo: "Pacientes", texto: "Identidade em rede e Pasta do Paciente." },
      { titulo: "Documentos", texto: "Modelos e Formulário de Saúde." },
      { titulo: "Fluxo do Paciente", texto: "Da placa ao Pronto, no celular." },
      { titulo: "Configurações", texto: "Precondições da operação." },
      { titulo: "Compliance e LGPD", texto: "Papéis, bases legais e guarda." },
    ],
  },
  planilha: {
    titulo: "Planilha modelo de pacientes", // provisório (PDD §10.1: "a clínica baixa a planilha modelo no módulo ATTA")
    subtitulo: "Para importar a base de pacientes da clínica", // provisório
    texto: "Baixe a planilha modelo da ATTA, preencha os pacientes e faça a importação no módulo Pacientes.", // provisório (PDD §10.1)
    baixar: "Baixar planilha modelo (.xlsx)", // provisório
  },
  faq: {
    titulo: "FAQ", // simulador
    subtitulo: "O que fazer quando algo foge do roteiro.", // simulador
    itens: [
      {
        p: "O paciente chegou 20 minutos atrasado. Ainda pode fazer o check-in?",
        r: "Sim. A placa não checa horário: escaneou, começou. A lista marca \"Atrasado\" só como aviso à recepção 15 min depois do horário; registre ausência apenas se ele não vier.",
      },
      {
        p: "A paciente recusou um termo obrigatório no celular. E agora?",
        r: "O documento vai para Cancelado com motivo \"Recusado pelo paciente\" e a liberação fica travada. Converse com ela; se mudar de ideia, o caminho é vincular um novo documento (o recusado não volta). Sem obrigatório assinado, o atendimento não acontece.",
      },
      {
        p: "O profissional não aparece na lista ao agendar.",
        r: "Só aparecem profissionais homologados (Termo de Autorização assinado), e autorizados pela clínica para o Serviço. O passo 2 do modal lista quem ficou de fora e por quê. Homologue em Equipe & Permissões.",
      },
      {
        p: "Preciso corrigir o texto de um termo já publicado.",
        r: "Modelos publicados não se editam: crie uma nova versão em Termos & Docs, com changelog. Documentos já assinados guardam a versão que o paciente leu; novos agendamentos usam a versão vigente.",
      },
      {
        p: "A recepção pode ver as respostas do Formulário de Saúde?",
        r: "Não, em nenhuma tela. Nem o ADMIN acessa o conteúdo. Só o profissional do atendimento, no Boarding Check, em modo leitura, com destaque apenas para alergia e medicamentos.",
      },
      {
        p: "O profissional perdeu o link do Boarding Check.",
        // ajustado: sem "Reenvio manual pela recepção: a definir"
        r: "O link vale 8 h ou até a conclusão e chega pelo WhatsApp do profissional. Não existe login nem acesso pela recepção sem PIN.",
      },
      {
        p: "A paciente quer o PDF do termo na hora.",
        // ajustado: sem "Canal de entrega do PDF ao paciente: a definir neste simulador"
        r: "Não há download antes da consolidação. O PDF nasce quando o profissional confirma \"Concluir atendimento\"; até então o documento é Pré-assinado e já verificável pelo Código ATTA.",
      },
      {
        p: "Posso reaproveitar o termo que ela assinou no mês passado?",
        r: "Nunca. Documentos \"Por procedimento\" são novos a cada atendimento. Só documentos de frequência \"Única\" (uso de imagem, aviso de privacidade) valem pelo prazo configurado e não são pedidos de novo enquanto vigentes.",
      },
      {
        p: "Paciente veio de outra clínica ATTA. Preciso cadastrar de novo?",
        // ajustado (CTO, 20/11; PLANO "CPF já existente na rede", R11: vale o PDD §10.1)
        r: "Não. Busque o CPF na rede no cadastro ou no agendamento: nome, nascimento e contato já informados voltam preenchidos para a recepção confirmar e vincular. As respostas de saúde dadas em outra clínica não aparecem para a clínica.",
      },
      {
        p: "Precisamos de assinatura com certificado ICP-Brasil.",
        r: "O ATTA-in não emite certificado ICP-Brasil nem usa plataforma de assinatura de terceiros. A assinatura é o ATTA Sign (SHA-256 + Código ATTA), com pacote de evidências e verificação pública.",
      },
      {
        p: "A internet caiu no meio do check-in.",
        r: "Não há modo offline. O celular retoma do último bloco salvo ao reconectar; se não der, a recepção usa o Fluxo alternativo, com justificativa registrada na trilha.",
      },
      {
        p: "Temos duas unidades. Dá para usar a mesma conta?",
        // ajustado: sem "Para redes, fale com um consultor na aba Soluções ATTA" (o contato do consultor ainda não existe)
        r: "Multiunidade está fora de escopo: cada estabelecimento é um tenant com CNPJ e RT próprios.",
      },
      {
        p: "E se eu publicar uma nova versão do modelo?",
        r: "A nova versão só vale para documentos futuros; o já assinado guarda a versão da época. O documento vence pelo prazo ou por nova versão, o que vier primeiro, e aí pede nova assinatura.",
      },
      {
        p: "Posso reaproveitar um documento \"Por procedimento\"?",
        r: "Não. Ele é exclusivo daquele procedimento, naquele atendimento: é sempre novo e não tem validade.",
      },
      {
        p: "O que acontece quando um documento \"Única\" vence?",
        r: "O sistema avisa a clínica (painel) e o paciente (ATTA me) quando ele vence ou está perto de vencer. Se for obrigatório, o vencido vira pendência e impede a liberação do atendimento; se for opcional, só avisa.",
      },
    ],
  },
} as const;
