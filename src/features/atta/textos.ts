// Textos do Módulo ATTA (MIG-48; PDD v206 §10.6). Layout e textos de interface do Simulador ATTA-in (capturas 19 a 23 e
// simulador/atta-modulo-textos.md); regra de negócio, dado entre clínicas e texto jurídico do PDD (decisão do CTO, 20/11).
// Cada linha diz a origem: "PDD §x", "simulador, captura n" ou "provisório" (vai ao textos-para-a-po.md).

const contagem = (n: number | null, um: string, varios: string) => `${n ?? "—"} ${n === 1 ? um : varios}`;

export const textos = {
  titulo: "ATTA", // PDD §10 (aba do painel); só para leitor de tela: a tela não repete a aba
  subabas: {
    rotulo: "Seções do ATTA", // provisório (nome da navegação, só para leitor de tela)
    ajuda: "Central de Ajuda", // PDD §10.6.1
    suporte: "Suporte & Chamados", // PDD §10.6.2
    privacidade: "Privacidade & Dados (LGPD)", // PDD §10.6.3
    cocriacao: "Co-criação", // simulador, captura 22 (PDD §10.6.4: "Co-criação (Ideias)")
    solucoes: "Soluções ATTA", // PDD §10.6.5
  },

  // estado vazio das subabas que ainda não têm tela (régua do Tech Lead Frontend, 20/11; sem "em construção") — provisório
  vazios: {
    ajuda: { titulo: "Nenhum guia publicado", texto: "Os guias por módulo e as respostas para o que foge do roteiro aparecem aqui." },
    suporte: { titulo: "Nenhum chamado aberto", texto: "Os chamados da clínica, cada um com o seu protocolo, aparecem aqui." },
    cocriacao: { titulo: "Nenhuma sugestão ainda", texto: "As sugestões da equipe da clínica aparecem aqui, com as curtidas de cada uma." },
  },

  privacidade: {
    faixa: {
      destaque: "Controlador × operador:", // simulador, captura 21
      texto: (clinica: string | null) =>
        // simulador, captura 21 (PDD §17.2/§10.6.3: a clínica é controladora, a ATTA operadora; uso anonimizado sem opção)
        `a clínica${clinica ? ` (${clinica})` : ""} é controladora dos dados dos seus pacientes; a ATTA é operadora e só trata dados por instrução dela, conforme o Acordo de Tratamento de Dados Pessoais. Indicadores agregados e efetivamente anonimizados são da ATTA, por adesão aos Termos, sem opção de ligar ou desligar.`,
    },
    cards: {
      categorias: { rotulo: "Categorias de dados", legenda: "em linguagem simples" }, // simulador, captura 21
      documentos: { rotulo: "Documentos assinados", legenda: "com guarda legal" }, // simulador, captura 21
      requisicoes: { rotulo: "Requisições de titular", legenda: (abertas: number | null) => `${abertas ?? "—"} em aberto` }, // simulador, captura 21
      prazo: { valor: "15 dias", rotulo: "Prazo de resposta", legenda: "LGPD art. 19, II" }, // simulador, captura 21 (CTO, 20/11: fica)
    },
    transparencia: {
      titulo: "Transparência de dados armazenados", // simulador, captura 21
      subtitulo: "Quatro categorias em linguagem simples, com o que a clínica tem hoje.", // simulador, captura 21
      categorias: {
        // nomes: PDD §10.6.3; descrições e bases legais: simulador, captura 21 (provisório para a PO: bases legais por categoria)
        clinica: {
          titulo: "Dados da Clínica",
          texto: "Nome, razão social, CNPJ, RT e endereço; equipe com login; procedimentos e modelos de documento. Compõem o ATTA Sign.",
          numeros: (membros: number | null, procedimentos: number | null, modelos: number | null) =>
            [contagem(membros, "membro", "membros"), contagem(procedimentos, "procedimento", "procedimentos"), contagem(modelos, "modelo", "modelos")].join(" · "),
          base: "Base legal: execução do contrato.",
        },
        pacientes: {
          titulo: "Dados Cadastrais dos Pacientes",
          texto: "Nome civil e social, CPF, data de nascimento, celular, e-mail, CEP e cidade. Identidade em rede pelo CPF, com consentimento de portabilidade.",
          numeros: (pacientes: number | null, documentos: number | null) =>
            [contagem(pacientes, "paciente", "pacientes"), contagem(documentos, "documento assinado", "documentos assinados")].join(" · "),
          base: "Base legal: tutela da saúde e obrigação legal de guarda (art. 11, II).",
        },
        saude: {
          titulo: "Perfil de Saúde (Formulário de Saúde)",
          texto: "Respostas fechadas por procedimento, vinculadas ao CPF. Só o profissional do atendimento lê, no Boarding Check; recepção e ADMIN não têm acesso (19.4).",
          // provisório: o simulador conta "na rede"; aqui só a clínica (dado entre clínicas segue o PDD)
          numeros: (respostas: number | null) => contagem(respostas, "resposta de saúde", "respostas de saúde"),
          base: "Dado sensível (art. 5º, II). Não entra em notificações nem chamados. É usado só pela ATTA, de modo anônimo, sem identificar paciente, profissional nem clínica.",
        },
        logs: {
          titulo: "Logs de Uso e Auditoria",
          texto: "Quem fez o quê, quando, de qual IP e dispositivo, inclusive leituras de dado sensível. Append-only: ninguém edita ou apaga.",
          numeros: (registros: number | null) => contagem(registros, "registro", "registros"), // provisório (o simulador diz "nesta sessão")
          base: "Guarda de 2 anos (Marco Civil da Internet).",
        },
      },
    },
    prazos: {
      titulo: "Prazos de guarda legal", // simulador, captura 21
      subtitulo: "Com a base jurídica de cada prazo.", // provisório
      colunas: { dado: "Dado", prazo: "Prazo", base: "Base jurídica" }, // simulador, captura 21
      // texto jurídico: PDD §10.6.3 (decisão do CTO, 20/11); a base das duas primeiras linhas é do simulador (provisório)
      linhas: [
        { dado: "Dados da assinatura ativa", prazo: "Durante a assinatura do plano", base: "Execução do contrato" },
        { dado: "Dados após o cancelamento", prazo: "Exportáveis por até 30 dias corridos", base: "Contrato de licenciamento" },
        {
          dado: "Documentos assinados e registros do atendimento (Termos & Docs)",
          prazo:
            "Guardados enquanto a assinatura estiver ativa. A guarda legal de 20 (vinte) anos a partir do último registro é obrigação da clínica, que exporta o acervo ao cancelar; depois dos 30 dias de exportação, a ATTA elimina o acervo da clínica. A cópia do paciente continua no ATTA me, como histórico dele.",
          base: "Lei nº 13.787/2018",
        },
        { dado: "Logs de auditoria e IPs", prazo: "2 anos", base: "Marco Civil da Internet" },
      ],
    },
    consentimento: {
      titulo: "Políticas de consentimento", // simulador, captura 21
      subtitulo: "Ficam em Configurações, junto com os termos aceitos.", // simulador, captura 21
      // simulador, captura 21, com "Divulgação como cliente" (CTO, 20/11: também só em Configurações) — provisório
      texto:
        "Divulgação como cliente e Comunicações e Novidades (desativados até você ativar) e a lista de termos e políticas vigentes estão em Configurações › Termos & Políticas.",
    },
    requisicoes: {
      titulo: "Requisições de titular", // simulador, captura 21
      subtitulo: "Exportação, exclusão e relatório LGPD pedidos pelo titular dos dados.", // provisório (PDD §10.6.3)
      vazio: "Nenhuma requisição de titular registrada.", // provisório
    },
  },

  solucoes: {
    faixa: { destaque: "Em breve:", texto: "o ATTA me chega para o paciente, com identidade e consentimentos pelo CPF." }, // simulador, captura 23
    proximo: { titulo: "Próximo produto", subtitulo: "O que vem depois do ATTA-in." }, // simulador, captura 23
    attaMe: {
      nome: "ATTA", // marca
      sufixo: "me", // marca
      rotuloFalado: "ATTA me", // provisório (nome do produto para o leitor de tela)
      tipo: "App do paciente", // simulador, captura 23 (versalete por CSS)
      texto: "O paciente carrega a própria identidade e os consentimentos pelo CPF, em qualquer estabelecimento ATTA.", // simulador, captura 23
      chip: "Em breve", // simulador, captura 23
    },
  },
} as const;
