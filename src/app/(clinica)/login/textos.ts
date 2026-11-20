// Textos da tela de entrar. O PDD v206 não tem texto literal para ela; vale o artefato aprovado "Site ATTA-in", página
// "Entrar" (pedido do dono, 20/11), e o Simulador ATTA-in (captura 07) no que o artefato não mostra. Os marcados
// "provisório" não aparecem em nenhum dos dois e vão para o textos-para-a-po.md.
export const textos = {
  titulo: ["Entrar no", "painel da clínica"], // artefato (duas linhas)
  subtitulo: "Acesso da equipe por convite do gestor da clínica.", // artefato
  email: "E-mail", // artefato
  senha: "Senha", // artefato
  mostrar: "Mostrar", // simulador
  ocultar: "Ocultar", // provisório (o simulador só mostra o estado "Mostrar")
  entrar: "Entrar", // artefato
  entrando: "Entrando…", // provisório
  // PDD §26.8: erro em linguagem humana; §19.3: sem dado pessoal na mensagem
  erros: {
    NAO_AUTENTICADO: "Credenciais inválidas.", // simulador (também para conta pendente ou suspensa)
    VALIDACAO: "Informe o e-mail e a senha.", // provisório
    LIMITE: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.", // provisório
    OUTRO: "Não conseguimos entrar agora. Tente de novo em instantes.", // provisório
  },
  esqueci: "Esqueci a senha", // artefato
} as const;
