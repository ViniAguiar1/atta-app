// Textos da casca do painel (MIG-40). Rótulos das abas: Simulador ATTA-in, captura 01.
export const textos = {
  modulos: "Módulos do painel",
  barraClara: "Deixar a barra clara",
  barraEscura: "Deixar a barra escura",
  menuDaPessoa: (nome: string) => (nome ? `Menu de ${nome}` : "Menu da conta"), // provisório
  sair: "Sair / trocar usuário", // simulador
  contador: (n: number) => `${n} pendente${n === 1 ? "" : "s"}`,
  sino: (n: number) => (n > 0 ? `Notificações, ${n} nova${n === 1 ? "" : "s"}` : "Notificações"),
  // Módulos ainda sem tela de dados: estado vazio do design. O simulador não tem estes estados: tudo provisório,
  // listado ao CTO. Cada módulo troca pela própria tela no item dele (MIG-44, MIG-45, MIG-46; o ATTA já tem a dele, MIG-48).
  vazios: {
    documentos: {
      titulo: "Termos & Docs", // simulador (aba)
      vazio: { titulo: "Nenhum modelo de documento ainda", texto: "Os termos e documentos da clínica aparecem aqui." }, // provisório
    },
    metricas: {
      titulo: "Métricas", // simulador (aba)
      vazio: { titulo: "Ainda não há dados para as métricas", texto: "Os números aparecem aqui conforme a clínica usa o ATTA-in." }, // provisório
    },
    notificacoes: {
      titulo: "Notificações", // PDD §10 (sino de Atividades)
      vazio: { titulo: "Nenhuma notificação", texto: "Os avisos da clínica aparecem aqui." }, // provisório
    },
  },
} as const;
