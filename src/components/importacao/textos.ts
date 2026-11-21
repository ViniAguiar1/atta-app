import type { CampoDescartado, MotivoLinha } from "@/server/importacao/porta";

// Textos da Importação de pacientes (PDD v206 §10.1, "Importação da base de pacientes"; Simulador ATTA-in, captura 48;
// PLANO "Importação de pacientes, MIG-34"). O fluxo é um componente só, usado no módulo Pacientes e em Configurações
// (decisão do CTO, 21/11). Preço nunca fixo aqui: vem da API. Fica fora a linha de demonstração da captura.

const reais = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
export const dinheiro = reais;

/** Versão do texto da declaração gravada com o envio (PDD §10.1: "gravada com texto e versão"). Mudou o texto, muda a versão. */
export const VERSAO_DA_DECLARACAO = "2026-11-21";

export const textosDaImportacao = {
  // Configurações › Importação de pacientes (captura 48)
  titulo: "Importação de pacientes", // simulador, captura 48
  quem: { destaque: "Quem importa.", texto: " A importação de base é feita só pelo gestor (ADMIN). A recepção cadastra pelo botão Novo paciente, no módulo Pacientes." }, // simulador, captura 48
  modelo: {
    titulo: "Importação pela planilha modelo", // simulador, captura 48
    subtitulo: "Você envia a planilha modelo da ATTA", // simulador, captura 48
    incluida: (proxima: 1 | 2) => (proxima === 1 ? "Incluída · importação da base (1 de 2)" : "Incluída · importação complementar (2 de 2)"), // simulador, captura 48 (o "2 de 2": provisório)
    porImportacao: (centavos: number) => `${reais(centavos)} · por importação depois dos 3 meses`, // simulador, captura 48 (valor do PDD, pela API)
    feitaPelaAtta: (centavos: number) => `${reais(centavos)} · feita pela ATTA`, // simulador, captura 48
    // simulador, captura 48, com o valor do PDD vindo da API (o mesmo da importação completa, PDD §10.1)
    texto: (desde: string, ate: string, porImportacao: number, completa: number) =>
      `Planilha .xlsx do modelo da ATTA, até 20 MB, processada em até 3 dias úteis. A assinatura inclui 1 importação da base e 1 complementar nos 3 primeiros meses (assinatura desde ${desde}; cota vale até ${ate}). Depois, cada importação feita pela própria clínica custa ${reais(porImportacao)}; se a ATTA fizer a importação (importação completa), são ${reais(completa)}.`,
  },
  completa: {
    titulo: "Importação completa pela ATTA", // simulador, captura 48
    subtitulo: "A ATTA monta a planilha e importa para você", // simulador, captura 48
    pagamentoUnico: (centavos: number) => `${reais(centavos)} · pagamento único`, // simulador, captura 48
    mensalidade: "lançado na próxima mensalidade", // simulador, captura 48
    contratada: "Contratada", // provisório (chip quando a clínica já contratou)
    texto: (centavos: number) =>
      `A ATTA monta a planilha a partir do seu material (Excel, CSV, PDF ou Markdown, até 20 MB) e importa para você. Pagamento único de ${reais(centavos)}, lançado na próxima mensalidade. Pode ser contratada mesmo sem usar a importação pela planilha modelo.`, // simulador, captura 48
  },

  // o fluxo (o mesmo no módulo Pacientes e em Configurações)
  importar: "Importar base de pacientes", // PDD §10.1 (nome da ação) e simulador, captura 48
  fluxo: {
    titulo: "Importar base de pacientes", // PDD §10.1
    fechar: "Fechar", // provisório (rótulo do ✕ para o leitor de tela)
    passoModelo: "1. Baixe a planilha modelo e preencha a aba Pacientes", // provisório
    modeloTexto: "Só a planilha modelo é aceita (.xlsx, até 20 MB), com as colunas Nome completo, CPF, Data de nascimento, Celular e E-mail. Outras informações do arquivo não são gravadas.", // PDD §10.1
    baixarModelo: "Baixar a planilha modelo", // PDD §10.1 ("Baixar o modelo")
    passoDeclaracao: "2. Declaração", // provisório
    // PDD §10.1 ("Declaração antes do envio"): os três itens, ditos em primeira pessoa pelo gestor (texto provisório, à PO)
    declaracao:
      "Declaro que a clínica é controladora desses dados e tem base legal para compartilhá-los com a ATTA; que cada paciente é ou já foi atendido pela clínica; e que as informações são verdadeiras e sem pacientes repetidos.",
    passoArquivo: "3. Envie a planilha", // provisório
    escolherArquivo: "Escolher a planilha (.xlsx)", // provisório
    arquivoTexto: "A área de envio é liberada depois da declaração.", // PDD §10.1 (provisório na forma)
    lendo: "Lendo a planilha…", // provisório
    previaTitulo: "Prévia da importação", // provisório (PLANO: prévia no servidor antes do envio)
    previaResumo: (validas: number, total: number) => `${validas} de ${total} linha(s) entram na importação.`, // provisório
    foraDaImportacao: "Linhas que ficam de fora", // provisório
    emBranco: "Linhas que entram com campo em branco", // provisório
    linhaFora: (linha: number, motivo: string) => `Linha ${linha}: ${motivo}`, // provisório
    linhaEmBranco: (linha: number, campo: string) => `Linha ${linha}: entra sem ${campo}`, // provisório (PDD: "se faltarem, entram em branco")
    prazo: "O processamento leva até 3 dias úteis.", // PDD §10.1
    semVolta: "O envio é a autorização: depois de confirmado, o processo não pode ser interrompido nem desfeito.", // PDD §10.1
    confirmar: (n: number) => (n === 1 ? "Importar 1 paciente" : `Importar ${n} pacientes`), // provisório
    nenhumaValida: "Nenhuma linha pode ser importada. Corrija a planilha e envie de novo.", // provisório
    outraPlanilha: "Escolher outra planilha", // provisório
    enviado: (ate: string) => `Importação recebida. O processamento leva até 3 dias úteis (até ${ate}).`, // PDD §10.1 (provisório na forma)
    concluir: "Fechar", // provisório
  },
  motivo: {
    nome_ausente: "falta o nome completo", // PDD §10.1 ("nome completo ou CPF ausente")
    nome_invalido: "nome com menos de 2 ou mais de 200 letras", // provisório (contrato com a Integrações, revisão do #276)
    cpf_ausente: "falta o CPF", // PDD §10.1
    cpf_invalido: "CPF inválido", // PDD §10.1
    cpf_repetido_na_planilha: "CPF repetido na planilha (fica a primeira linha)", // provisório (contrato com a Integrações)
    repetido_diferente: "mesmo CPF com dados diferentes (nenhuma das linhas entra)", // PDD §10.1 ("paciente repetido com dados diferentes")
    ja_na_clinica: "o CPF já é paciente desta clínica", // provisório (contrato com a Integrações)
  } satisfies Record<MotivoLinha, string>,
  campo: { nascimento: "data de nascimento", celular: "celular", email: "e-mail" } satisfies Record<CampoDescartado, string>, // provisório
  erro: {
    foraDoModelo: "Este arquivo não está no modelo da ATTA. Baixe a planilha modelo de novo e preencha a aba Pacientes.", // PDD §10.1 ("recusado com orientação para baixar o modelo de novo")
    tipo: "Envie a planilha modelo em .xlsx.", // PDD §10.1 (provisório na forma)
    tamanho: "A planilha passa de 20 MB.", // PDD §10.1 (provisório na forma)
    LIMITE: "A planilha passa de 20 MB ou do limite de linhas.", // provisório
    SEM_PERMISSAO: "Só o gestor da clínica importa a base de pacientes.", // provisório (PDD §10.1: "só pelo gestor")
    envio: "Não foi possível enviar a planilha. Tente de novo.", // provisório
    outro: "Não foi possível concluir agora. Tente de novo.", // provisório
  },
} as const;
