// Textos do check-in, num lugar só: troca de texto não mexe em tela.
// - "PDD": literal do PDD v206; não mude sem a PO.
// - "provisório": o PDD não define; texto do CTO em 20/11 (migracao/textos-para-a-po.md), aguardando a PO.
// - sem marca: microcopy de tela.
export const TEXTOS = {
  identificacao: // PDD §11.4, decisão da PO
    "Informe o CPF do agendamento para iniciar o check-in. Vamos enviar um código por WhatsApp para o celular que a clínica tem cadastrado.",
  cpfInvalido: "Confira o CPF: algum número não bate.",
  semAtendimentoAntesDoCodigo: "Não encontramos atendimento para hoje nesta clínica. Procure a recepção.", // provisório
  semAtendimento: "Não encontramos atendimento hoje para este CPF", // PDD §11.9 (cancelado, depois do código)
  codigoNaoConfere: "Não conseguimos confirmar o código. Confira o WhatsApp ou procure a recepção.", // PDD §11.4
  naoRecebeu: "Não recebeu o código? Procure a recepção.", // PDD §11.4
  codigoCancelado: "Este código não vale mais. Peça um novo.", // provisório (5 erros)
  indisponivel: "Não conseguimos continuar agora. Tente de novo em instantes.",
  cadastroNovo: "Não encontramos seu cadastro — vamos criar um novo, é rápido.", // PDD §11.4
  concluido: "Check-in concluído para este CPF", // PDD §11.9
  divergencia: "Vamos confirmar sua identidade na recepção antes de continuar.", // PDD §11.4
  // provisório (texto do simulador): as duas frases formam a mensagem inteira, título e texto
  ausenteTitulo: "Este atendimento foi marcado como ausente.",
  ausenteTexto: "Procure a recepção: ela reabre o preenchimento e você segue o check-in normalmente.",
  voltarAoInicio: "Voltar para o início", // provisório (simulador)
} as const;
