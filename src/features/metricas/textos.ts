// Textos do Painel de Métricas (MIG-46). Fonte: o Simulador ATTA-in (captura 40), que vale para o visual e os textos de
// interface (decisão do dono de 20/11), e o PDD v206 §10.5 para a regra. Ficam fora a frase de demonstração da faixa
// ("Os números de hoje vêm dos atendimentos reais; o histórico dos gráficos é de demonstração") e os valores de exemplo.
// O que não está no simulador é provisório e vai para o textos-para-a-po.md.
export const textos = {
  titulo: "Métricas", // aba (o h1 é só para o leitor de tela: a aba já diz o módulo, PDD §10)
  subabas: {
    rotulo: "Seções de Métricas", // provisório (nome da navegação para o leitor de tela)
    painel: "Painel", // simulador, captura 40
    funil: "Funil e tendências", // simulador, captura 40
    exportacao: "Exportação", // simulador, captura 40
  },
  // estado sem dados do Painel inteiro (só no esqueleto e no erro do DataState; o Painel em si mostra "—" nos números)
  painel: {
    vazio: { titulo: "Ainda não há dados para as métricas", texto: "Os números aparecem aqui conforme a clínica usa o ATTA-in." }, // provisório
  },
  faixa: "Mede a eficiência do check-in, nunca o desempenho clínico.", // simulador, captura 40 (sem a frase de demonstração)
  validosHoje: (n: number) => `${n} atendimento(s) válido(s) hoje`, // simulador, captura 40
  cards: {
    rotulo: "Indicadores do mês", // provisório (nome da região para o leitor de tela)
    tempoMedio: "Tempo médio de check-in", // simulador, captura 40
    tempoMedioLegenda: (hoje: string | null) => (hoje ? `hoje ${hoje} · média de 30 dias` : "média de 30 dias"), // simulador, captura 40
    tempoSalvo: "Tempo operacional salvo", // simulador, captura 40
    tempoSalvoLegenda: "no mês, sem papel e sem filas", // simulador, captura 40
    extras: "Atendimentos extras no mês", // simulador, captura 40
    extrasLegenda: "capacidade liberada no mês", // simulador, captura 40
    documentos: "Documentos assinados", // simulador, captura 40
    documentosLegenda: (formularios: string | null) => (formularios ? `no mês · ${formularios} Formulários de Saúde` : "no mês"), // simulador, captura 40
  },
  preparacao: {
    titulo: "Taxa de Preparação Prévia", // simulador, captura 40
    subtitulo: "Atendimentos que chegaram com o check-in pronto", // simulador, captura 40
    detalhe: (prontos: number, total: number) => `${prontos} de ${total} atendimentos de hoje chegaram com o check-in pronto`, // simulador, captura 40
    vazio: "Nenhum atendimento hoje ainda.", // provisório
  },
  tempos: {
    titulo: "Tempos de hoje", // simulador, captura 40
    subtitulo: "Média do dia, com mediana e p90", // simulador, captura 40
    checkin: "Check-in do paciente", // simulador, captura 40
    checkinLegenda: "do escaneamento ao pronto", // simulador, captura 40
    recepcao: "Recepção", // simulador, captura 40
    recepcaoLegenda: "até a liberação", // simulador, captura 40
    mediana: "Mediana", // simulador, captura 40
    p90: (valor: string | null) => (valor ? `p90 ${valor}` : "p90 —"), // simulador, captura 40
  },
  graficos: {
    tendencia: { titulo: "Tendência do Tempo Médio de Check-in", subtitulo: "últimos 30 dias · média diária" }, // simulador, captura 40
    extrasPorMes: { titulo: "Atendimentos Extras por Mês", subtitulo: "6 meses · capacidade equivalente" }, // simulador, captura 40
    vazio: "Ainda não há atendimentos suficientes para o gráfico.", // provisório
  },
  funil: {
    vazio: { titulo: "Ainda não há dados para o funil", texto: "O funil e as tendências aparecem conforme os pacientes fazem o check-in." }, // provisório
  },
  exportacao: {
    vazio: { titulo: "Nada para exportar ainda", texto: "A exportação do período em CSV ou PDF fica disponível quando houver dados." }, // provisório (PDD §10.5.4)
  },
} as const;
