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
