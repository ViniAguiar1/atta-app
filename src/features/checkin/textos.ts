// Textos do check-in. Os marcados "PDD" são literais do PDD v206 (não mude sem a PO); os outros são microcopy de tela.
export const TEXTOS = {
  identificacao: // PDD §11.4, decisão da PO
    "Informe o CPF do agendamento para iniciar o check-in. Vamos enviar um código por WhatsApp para o celular que a clínica tem cadastrado.",
  cpfInvalido: "Confira o CPF: algum número não bate.",
  semAtendimento: "Não encontramos atendimento hoje para este CPF", // PDD §11.9
  codigoNaoConfere: "Não conseguimos confirmar o código. Confira o WhatsApp ou procure a recepção.", // PDD §11.4
  naoRecebeu: "Não recebeu o código? Procure a recepção.", // PDD §11.4
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.",
  cadastroNovo: "Não encontramos seu cadastro — vamos criar um novo, é rápido.", // PDD §11.4
  concluido: "Check-in concluído para este CPF", // PDD §11.9
  divergencia: "Vamos confirmar sua identidade na recepção antes de continuar.", // PDD §11.4
} as const;
