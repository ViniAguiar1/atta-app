// Textos da tela de entrar. O PDD v206 não tem texto literal para ela; vale o Simulador ATTA-in (captura 07 e README,
// decisão do CTO em 20/11). Os marcados "provisório" não aparecem no simulador e vão para o textos-para-a-po.md.
export const textos = {
  titulo: "Entrar no painel da clínica", // simulador
  subtitulo: "Acesso da equipe por convite do gestor. Profissionais não têm login: recebem o Boarding Check por WhatsApp.", // simulador
  email: "E-mail", // simulador
  senha: "Senha", // simulador
  mostrar: "Mostrar", // simulador
  ocultar: "Ocultar", // provisório (o simulador só mostra o estado "Mostrar")
  entrar: "Entrar", // simulador
  entrando: "Entrando…", // provisório
  // PDD §26.8: erro em linguagem humana; §19.3: sem dado pessoal na mensagem
  erros: {
    NAO_AUTENTICADO: "Credenciais inválidas.", // simulador (também para conta pendente ou suspensa)
    VALIDACAO: "Informe o e-mail e a senha.", // provisório
    LIMITE: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.", // provisório
    OUTRO: "Não conseguimos entrar agora. Tente de novo em instantes.", // provisório
  },
} as const;
