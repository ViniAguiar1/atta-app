import type { TipoDeModelo } from "@/server/documentos/porta";

// Textos de Termos & Docs › Modelos de documento, num lugar só. "simulador": literal da captura 39 (o visual segue o
// simulador). "PDD": literal do PDD v206 (§10.3.2.1, §17.2). "provisório": nem um nem outro; vai ao CTO para o
// textos-para-a-po.md.
export const textos = {
  titulo: "Termos & Docs", // simulador (aba)
  subaba: "Modelos de documento", // simulador; PDD §10.3.2.1
  subabas: {
    rotulo: "Seções de Termos & Docs", // provisório (leitor de tela)
    modelos: "Modelos de documento", // simulador; PDD §10.3.2.1
    formularios: "Formulários de Saúde", // simulador; PDD §10.3.2.1
    perguntas: "Banco de Perguntas", // simulador; PDD §10.3.2.1
  },
  formulariosVazio: {
    titulo: "Nenhum formulário de saúde ainda", // provisório (estado vazio até a tela do MIG-22)
    texto: "Os formulários que a clínica montar com o Banco de Perguntas aparecem aqui.", // provisório
  },
  perguntasVazio: {
    titulo: "Nenhuma pergunta no banco ainda", // provisório (estado vazio até a tela do MIG-22)
    texto: "As perguntas cadastradas ficam aqui para montar os formulários de saúde.", // provisório
  },
  cards: {
    rotulo: "Resumo dos modelos", // provisório (só para leitor de tela)
    ativos: "Termos ativos", // simulador (o CardDeResumo põe em versalete)
    obrigatoriosOpcionais: (obrig: string, opc: string) => `${obrig} obrigatório(s) · ${opc} opcional(is)`, // simulador
    vencendo: "Docs vencendo", // simulador
    vencidos: (n: string) => `${n} vencido(s) para reassinar`, // simulador
    assinados: "Documentos assinados", // simulador
    comAttaSign: (p: string) => `${p} com ATTA Sign`, // simulador ("100% com ATTA Sign")
  },
  colunas: {
    modelo: "Modelo", // simulador
    procedimentos: "Procedimentos", // simulador
    frequencia: "Frequência", // simulador
    recusa: "Recusa impede?", // simulador
    versao: "Versão", // simulador
    assinados: "Assinados", // simulador
  },
  rotuloDaLista: "Modelos de documento", // provisório (região rolável, leitor de tela)
  porProcedimento: "Por procedimento", // simulador; PDD §17.2
  unica: (validade: string) => `Única · ${validade}`, // simulador ("Única · 365 dias")
  meses: (n: number) => `${n} meses`, // provisório: o banco guarda 3, 6 ou 12 meses (RN-V-01), não dias
  indeterminada: "indeterminada", // PDD §16.5 (RN-V-01: "podendo ser indeterminado")
  obrigatorio: "Sim · obrigatório", // simulador
  opcional: "Não · opcional", // simulador
  versao: (n: number, mesAno: string) => `v${n}.${mesAno}`, // simulador ("v3.ago.2026")
  desde: (data: string) => `desde ${data}`, // simulador
  rascunho: "Rascunho", // PDD §10.3.1 (estado)
  inativo: "Inativo", // PDD §10.3.1 (estado)
  mais: (n: number) => `+${n}`, // simulador ("Toxina botulínica +3")
  semValor: "—", // regra do Tech Lead Frontend: número que não existe aparece como "—"
  rodape: (mostrados: number, total: number) => `${mostrados} de ${total} modelo(s)`, // simulador
  // menu ⋮ (o simulador mostra o botão, não o menu aberto): provisórios
  colunaAcoes: "Ações", // provisório (cabeçalho só para leitor de tela)
  menu: (titulo: string) => `Ações de ${titulo}`, // provisório
  acoes: {
    publicar: "Publicar", // provisório
    vincular_procedimentos: "Vincular procedimentos", // provisório (PDD §10.3.1: vínculo a procedimentos)
    inativar: "Inativar", // provisório (PDD §10.3.1: estado Inativo)
  },
  motivos: {
    service_ids: "Vincule ao menos um procedimento para publicar.", // provisório (disabled_reason do #69)
  } as Record<string, string>,
  publicado: (v: number) => `Versão ${v} publicada.`, // provisório
  errosDePublicar: {
    draft_body: "O texto do modelo está vazio.", // provisório
    frequency: "Escolha a frequência antes de publicar.", // provisório
    required: "Defina se a recusa impede o atendimento antes de publicar.", // provisório (RN-DOC-04)
    service_ids: "Vincule ao menos um procedimento para publicar.", // provisório
  } as Record<string, string>,
  semMudanca: "Não há mudança para publicar desde a última versão.", // provisório (ATTA-IN-0002:draft_body)
  falhou: "Não conseguimos concluir agora. Tente de novo em instantes.", // provisório
  inativar: {
    titulo: (t: string) => `Inativar "${t}"?`, // provisório
    texto:
      "O modelo deixa de valer para novos documentos. Os documentos já emitidos continuam válidos e consultáveis. Depois de inativado, ele não volta a ficar ativo.", // provisório (PDD §10.3.1; Inativo não volta, lacuna com a PO)
    confirmar: "Inativar modelo", // provisório
  },
  vincular: {
    titulo: (t: string) => `Procedimentos de "${t}"`, // provisório
    texto: "O modelo vale para os procedimentos marcados (PDD recomenda um termo por procedimento).", // provisório (PDD §10.3.1)
    inativo: "inativo", // provisório
    semServicos: "A clínica ainda não tem Serviços cadastrados. Cadastre em Configurações › Serviços.", // provisório
    salvar: "Salvar procedimentos", // provisório
  },
  cancelar: "Cancelar", // provisório
  salvando: "Salvando…", // provisório
  carregando: "modelos de documento", // provisório (leitor de tela)
  vazio: {
    titulo: "Nenhum modelo de documento ainda", // provisório (o PDD e o simulador não têm o estado vazio)
    texto: "Os modelos que a clínica criar aparecem aqui, com os procedimentos vinculados.", // provisório
  },
} as const;

/** Nome do tipo, embaixo do título do modelo (simulador: "Consentimento específico", "Uso de imagem"…; PDD §17.2). */
export const NOMES_DOS_TIPOS: Record<TipoDeModelo, string> = {
  tcle: "TCLE", // PDD §17.2
  consentimento_procedimento: "Consentimento específico", // simulador
  autorizacao_uso_imagem: "Uso de imagem", // simulador
  termo_responsabilidade_cuidados: "Termo de responsabilidade", // simulador
  contrato_prestacao_servicos: "Contrato de prestação de serviços", // PDD §17.2
  politica_cancelamento_no_show: "Política de cancelamento e no-show", // PDD §17.2
  personalizado: "Termo personalizado", // PDD §17.2 ("Termos personalizados")
  termo_de_autorizacao: "Termo de Autorização", // PDD §10.4.3
};
