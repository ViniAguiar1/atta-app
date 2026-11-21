// Textos da tela de Pacientes (MIG-43). Fonte: o Simulador ATTA-in (capturas 09 a 11 e o README "Pacientes, Pasta do
// Paciente e Novo paciente"), que aqui vale por cima do PDD §10 (decisão do dono de 20/11, PLANO "Abas e fidelidade ao
// simulador"). O que não está no simulador é provisório e vai para o textos-para-a-po.md. As linhas de demonstração do
// simulador ("Exemplos: …", "Estados do cadastro: …") ficam fora.

const data = (aaaaMmDd: string) => aaaaMmDd.split("-").reverse().join("/");

export const textos = {
  titulo: "Pacientes", // simulador, captura 09 (aba); só para leitor de tela: a tela não repete a aba
  subabas: {
    rotulo: "Seções de Pacientes", // provisório (nome da navegação para o leitor de tela)
    pacientes: "Pacientes", // simulador, captura 09
    pasta: "Pasta do Paciente", // simulador, captura 09
  },
  pasta: {
    // provisório: a Pasta abre pelo nome do paciente na lista; sem paciente escolhido, este é o estado vazio
    vazioTitulo: "Nenhum paciente aberto",
    vazioTexto: "Escolha um paciente na lista de Pacientes para abrir a Pasta dele.",
    irParaLista: "Ir para a lista de Pacientes",
  },
  cards: {
    rotulo: "Resumo dos pacientes", // provisório (nome da região para o leitor de tela)
    pacientes: "Pacientes", // simulador, captura 09
    comAtendimentoHoje: (n: number) => `${n} com atendimento hoje`, // simulador, captura 09
    retorno: "Retorno", // simulador, captura 09
    frequencia: "Frequência média", // simulador, captura 09
    csat: "CSAT do check-in", // simulador, captura 09
  },
  tabela: "Pacientes da clínica", // provisório (legenda da tabela, só para leitor de tela)
  busca: {
    rotulo: "Buscar paciente por nome ou CPF", // simulador, captura 09 (rótulo acessível)
    placeholder: "Buscar por nome ou CPF", // simulador, captura 09
    curta: "Digite ao menos 2 letras do nome ou o CPF completo.", // provisório
    achados: (n: number) => (n === 1 ? "1 paciente encontrado" : `${n} pacientes encontrados`), // provisório (só leitor de tela)
  },
  filtros: {
    rotulo: "Filtros", // simulador, captura 11 (rótulo do botão)
    outraClinica: "Cadastrados em outra clínica", // simulador, captura 11
    atendimentoHoje: "Com atendimento hoje", // simulador, captura 11
    arquivados: "Arquivados", // simulador, captura 11
  },
  novoPaciente: "+ Novo paciente", // simulador, captura 09
  // Modal Novo paciente: simulador, capturas 15 a 18 e print 31. Ficam fora as linhas de demonstração ("Exemplos: …"),
  // a consulta pública de nome e CPF (serviço externo, regra do dono) e as referências a regra ("RN-PAC-02", "PDD 10.1"),
  // que o PDD §10 proíbe na interface.
  modal: {
    titulo: "Novo paciente", // simulador, captura 15
    fechar: "Fechar", // provisório (rótulo do ✕ para o leitor de tela)
    identificacao: { titulo: "Identificação", subtitulo: "CPF ou RNE, conferido na rede ATTA" }, // simulador, captura 15
    estrangeiro: "Estrangeiro (informar RNE no lugar do CPF)", // simulador, captura 15
    cpf: "CPF", // simulador, captura 15
    cpfPlaceholder: "000.000.000-00", // simulador, captura 15
    buscar: "Buscar na rede", // simulador, captura 15
    buscando: "Buscando…", // provisório
    cpfAjuda: "Cada CPF existe uma única vez na rede ATTA.", // simulador, captura 15 (sem a linha de exemplos)
    rne: "RNE (Registro Nacional de Estrangeiro)", // simulador, captura 15
    rneAjuda: "O cadastro fica marcado como incompleto até haver CPF.", // simulador, captura 15 (sem a referência à regra)
    cpfInvalido: "Confira o CPF: os dígitos não conferem.", // provisório
    consultaInterna: "Consulta interna: este CPF ainda não existe na base ATTA.", // simulador, captura 18 (sem a consulta pública)
    jaExiste: {
      // simulador, captura 16 (o mesmo CPF já é paciente desta clínica)
      negrito: "Não é possível criar outro cadastro.",
      texto: "Esta identificação já existe uma vez na rede ATTA. A clínica só vincula: abra a pasta ou agende um atendimento com este CPF; os dados vêm prontos.",
    },
    naRede: {
      // provisório (PDD §10.1 e decisão do dono de 20/11: o cadastro da rede aparece para a recepção confirmar e vincular)
      texto: "Este CPF já existe na rede ATTA. Confira os dados com o paciente e vincule à clínica; não precisa digitar nada.",
      linha: (nomeCivil: string, nascimento: string | null) =>
        `Nome civil ${nomeCivil}${nascimento ? ` · nascimento ${nascimento.split("-").reverse().join("/")}` : ""}`, // simulador, captura 16
      selo: "Identidade verificada", // provisório (selo do ATTA me)
      saude: (n: number) => `Respostas de saúde: ${n} na rede · só a contagem`, // simulador, captura 13 (Pasta)
    },
    dados: { titulo: "Dados do paciente", subtitulo: "Cadastro mínimo feito pela recepção" }, // simulador, captura 15
    dadosAntes: "Os campos aparecem depois de buscar o CPF na rede e confirmar que o paciente é novo.", // simulador, captura 15
    dadosNovo: "Primeira vez na rede ATTA. Cadastro mínimo; o paciente completa endereço e saúde no check-in pelo celular.", // simulador, captura 18
    campos: {
      nomeCivil: { rotulo: "Nome civil", ajuda: "Nome e sobrenome." }, // simulador, captura 18
      nomeSocial: { rotulo: "Nome social (se houver)", ajuda: "Só se a pessoa usar. Quando informado, aparece no lugar do civil." }, // simulador, captura 18
      nascimento: { rotulo: "Data de nascimento", placeholder: "dd/mm/aaaa", ajuda: "Data válida, não futura." }, // simulador, captura 18
      celular: { rotulo: "Celular", placeholder: "(11) 90000-0000", ajuda: "Com DDD." }, // simulador, captura 18
      email: { rotulo: "E-mail", ajuda: "Opcional; necessário para enviar PDF por e-mail." }, // simulador, captura 18
    },
    resumo: {
      titulo: "Resumo do cadastro", // simulador, captura 15
      cpf: "CPF", rne: "RNE", situacao: "Situação", nome: "Nome", nascimento: "Nascimento", celular: "Celular", email: "E-mail", // simulador, captura 15
      aguardando: "Aguardando busca", jaExiste: "Já existe na rede", primeiraVez: "Primeira vez na rede", // simulador, capturas 15 a 18
      daRede: { titulo: "O paciente é da rede", texto: "A clínica só vincula: o mesmo CPF vale em todas as clínicas ATTA." }, // simulador, captura 15 (sem a referência ao PDD)
    },
    cancelar: "Cancelar", // simulador, captura 15
    cadastrar: "Cadastrar paciente", // simulador, captura 18
    enviando: "Cadastrando…", // provisório
    erroCampo: "Confira este campo.", // provisório
    erro: {
      CONFLITO: "Este paciente já está cadastrado nesta clínica.", // provisório
      LIMITE: "Muitas buscas seguidas. Aguarde um pouco e tente de novo.", // provisório
      NAO_ENCONTRADO: "Este CPF não está mais na rede. Busque de novo.", // provisório
      outro: "Não foi possível concluir agora. Tente de novo.", // provisório
    },
    reaproveitado: "Este CPF entrou na rede enquanto o cadastro era feito: o paciente foi vinculado com o cadastro da rede. Confira os dados abaixo.", // provisório
  },
  colunas: {
    paciente: "Paciente", // simulador, captura 09
    identificacao: "Identificação", // simulador, captura 09
    contato: "Contato", // simulador, captura 09
    atendimento: "Atendimento", // simulador, captura 09
  },
  chip: {
    incompleto: "Incompleto", // simulador, captura 10
    com_selo: "Com selo", // simulador, captura 10
    selo_expirado: "Selo expirado", // simulador, captura 09
  },
  nomeSocial: "usa nome social", // provisório (o asterisco do simulador, dito ao leitor de tela)
  identificacao: {
    cpfFalado: (final: string) => `CPF terminado em ${final}`, // provisório (padrão do painel, ADR 0002 §6)
    estrangeiro: "RNE", // provisório (RN-PAC-02; dono, 20/11: RNE ou RNM/CRNM)
    estrangeiroFalado: (final: string) => `RNE ou RNM terminado em ${final}`, // provisório
    semDocumento: "Sem documento", // provisório (RN-PAC-02)
    nascimento: (aaaaMmDd: string | null) => `Nasc. ${aaaaMmDd ? data(aaaaMmDd) : "—"}`, // simulador, captura 09
    semNascimentoFalado: "Nascimento não informado", // provisório (o "Nasc. —" dito ao leitor de tela)
  },
  semCelular: "Sem celular", // simulador, captura 09
  semEmail: "Sem e-mail", // simulador, captura 09
  atendimento: {
    rotulo: { ultimo: "Último atendimento", proximo: "Próximo agendamento" }, // simulador, captura 09
    // simulador, captura 09: "20/11/2026 às 08:30" e "Procedimento · Profissional"
    quando: (em: string) => `${data(em.slice(0, 10))} às ${em.slice(11, 16)}`,
    oQue: (procedimento: string, profissional: string) => `${procedimento} · ${profissional}`,
    nenhum: "Nenhum atendimento aqui", // simulador, captura 09
  },
  vazio: {
    titulo: "Nenhum paciente cadastrado", // provisório
    texto: "Os pacientes aparecem aqui quando a recepção faz o cadastro ou quando a base de pacientes é importada.", // provisório
  },
  rodape: (mostrados: number, total: number) => `${mostrados} de ${total} ativo(s)`, // simulador, captura 10
  carregarMais: "Carregar mais pacientes", // provisório (o simulador não pagina; a API pagina de 50 em 50)
  estado: "lista de pacientes", // provisório (rótulo do DataState para leitor de tela)
} as const;
