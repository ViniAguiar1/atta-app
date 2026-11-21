// Textos da verificação pública do Código ATTA, num lugar só. "simulador": literal das capturas 53 a 55 (o visual segue
// o simulador). "PDD": literal do PDD v206 (§18.6, §17.2, §10.2.3). "provisório": nem um nem outro; vai ao CTO.
export const textos = {
  sobretitulo: "Página pública", // simulador ("PÁGINA PÚBLICA", em versalete pelo CSS)
  titulo: "Qualquer pessoa confere um documento pelo código", // simulador
  subtitulo: "Existência, momento, estabelecimento e integridade. Nunca o conteúdo do termo nem dados da paciente.", // simulador
  rotuloCodigo: "Código ATTA", // simulador
  placeholder: "ATTA-XXXX-XXXX-XXXX", // simulador
  verificar: "Verificar", // simulador
  verificando: "Verificando…", // provisório
  rotuloResultado: "Resultado da verificação", // provisório (leitor de tela)
  resumo: (documento: string, estado: string) => `Documento encontrado: ${documento}. Estado: ${estado}.`, // provisório (leitor de tela)
  linhas: {
    documento: "Documento", // simulador
    estado: "Estado", // simulador
    assinatura: "Assinatura", // simulador
    estabelecimento: "Estabelecimento", // simulador
    integridade: "Integridade", // simulador
  },
  existe: "Existe", // simulador
  cnpj: (cnpj: string) => `CNPJ ${cnpj}`, // simulador (o CNPJ como foi assinado, sem formatar de novo)
  // integridade calculada no servidor (recalcula o hash e confere o selo; ADR 0007, #225)
  confereComAEvidencia: "Confere com a evidência", // simulador
  shaRecalculado: (hash: string) => `SHA-256 recalculado: ${hash}`, // simulador
  naoConfere: "Não confere com a evidência", // provisório (o simulador só tem o caso que confere)
  naoConfereAviso:
    "A integridade deste documento não confere: não confie no estabelecimento nem nos dados mostrados abaixo.", // provisório (Segurança)
  shaDaEvidencia: (hash: string) => `SHA-256 da evidência: ${hash}`, // provisório (documento sem conferência)
  naoEncontrado: "Código não encontrado.", // simulador
  naoEncontradoAjuda: "Confira os 12 caracteres. A resposta nunca revela se um código \"quase\" existe.", // simulador
  limite: "Muitas consultas seguidas. Aguarde um minuto e tente de novo.", // provisório (30 por minuto por IP)
  indisponivel: "Não conseguimos verificar agora. Tente de novo em instantes.", // provisório
  carregando: "Verificando o código…", // provisório
} as const;

/** Estado público do documento (§10.2.3 e §17.6). Só "Assinado" tem tela no simulador; os outros mostram o nome do
 * estado do PDD, no mesmo chip, até a PO definir o texto (R25a). */
export const ESTADOS: Record<string, string> = {
  assinado_definitivo: "Assinado", // simulador
  pre_assinado: "Pré-assinado", // PDD §10.2.3 (nome do estado)
  cancelado: "Cancelado", // PDD §10.2.3 (nome do estado)
  substituido: "Substituído", // PDD §17.5 (nome do estado)
  recusado: "Recusado", // PDD §10.2.3 (nome do estado)
};

/** Nome do documento pelo tipo (PDD §17.2; o Termo de Autorização com o nome do §10.4.3, como na captura 54). */
export const TIPOS: Record<string, string> = {
  termo_de_autorizacao: "Termo de Autorização de Uso de Imagem de Assinatura Digital", // simulador; PDD §10.4.3
  tcle: "TCLE — Termo de Consentimento Livre e Esclarecido", // PDD §17.2
  consentimento_procedimento: "Consentimento específico de procedimento", // PDD §17.2
  autorizacao_uso_imagem: "Autorização de uso de imagem", // PDD §17.2
  termo_responsabilidade_cuidados: "Termo de responsabilidade e cuidados", // PDD §17.2
  contrato_prestacao_servicos: "Contrato de prestação de serviços e plano de tratamento", // PDD §17.2
  politica_cancelamento_no_show: "Política de cancelamento e no-show", // PDD §17.2
  personalizado: "Termo personalizado", // PDD §17.2
};
