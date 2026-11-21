// Textos de Configurações › Assinaturas & Validade (PDD v206 §10.4.2; Simulador ATTA-in, captura 46 e
// simulador/46-config-assinaturas-completa.md). Regra: PDD. Textos de interface: simulador. Preview (decisão do CTO,
// 21/11, R25): dados reais do Perfil, "hash do preview" calculado de verdade, Código ATTA só no formato, sem QR e sem
// código do estabelecimento. Os valores de exemplo do simulador não entram.
import type { ModeloDeAssinatura } from "@/server/assinaturas/tipos";

export const textos = {
  titulo: "Assinaturas & Validade", // PDD §10.4.2 (só para leitor de tela: o menu já mostra a seção)
  estado: "configurações de assinatura", // provisório (rótulo do DataState)
  vazio: {
    titulo: "Nenhum modelo de assinatura definido", // provisório
    texto: "Quem assina os documentos da clínica e como a assinatura aparece neles ficam aqui.", // provisório
  },
  modelo: {
    titulo: "Modelo de Assinatura da Clínica", // PDD §10.4.2
    subtitulo: "Quem responde juridicamente", // simulador
    legenda: "Modelo de Assinatura da Clínica", // provisório (nome do grupo de opções para leitor de tela)
    rodape:
      "O modelo escolhido vale para os próximos documentos: as partes institucionais assinam conforme ele. Documentos já assinados não mudam.", // simulador (PDD/ADR: vale só para os próximos)
    opcoes: {
      rt_apenas: {
        nome: "Apenas Responsável Técnico (RT)", // PDD §10.4.2
        texto: "O RT assina como representante legal centralizado, em todos os documentos da clínica.", // simulador
        cenario: "Cenário: equipe pequena sob um único RT, que responde institucionalmente por cada atendimento.", // simulador
        selos: [] as string[],
      },
      profissional_apenas: {
        nome: "Profissional do Atendimento (Executor)", // PDD §10.4.2
        texto: "Quem executa o procedimento assina individualmente, sob responsabilidade técnica pessoal.", // simulador
        cenario: "Cenário: profissionais autônomos que atendem na clínica e respondem cada um pelo próprio ato.", // simulador
        selos: [] as string[],
      },
      rt_profissional: {
        nome: "RT + Profissional Executor", // PDD §10.4.2
        texto: "Os dois assinam o mesmo documento: chancela institucional do RT e responsabilidade individual de quem executou.", // simulador
        cenario: "Cenário: clínica que quer a dupla camada de responsabilidade em todo termo, contrato e prontuário.", // simulador
        selos: ["Padrão recomendado", "Altamente seguro"], // PDD §10.4.2 ("Padrão Recomendado", "Altamente Seguro"), grafia do simulador
      },
    } satisfies Record<ModeloDeAssinatura, { nome: string; texto: string; cenario: string; selos: string[] }>,
  },
  metodo: {
    titulo: "Método de Assinatura Digital", // PDD §10.4.2
    subtitulo: "Assinatura digital", // simulador
    nome: "ATTA Sign", // PDD §10.4.2
    selos: ["Incluso no produto base", "Assinatura eletrônica avançada (objetivo)"], // simulador
    texto:
      "Hash SHA-256 do payload canônico, Código ATTA e QR de verificação pública em verify.attahub.com.br, com registro de origem da conexão, do fator de autenticação e do momento.", // simulador
    fundamento: "Validade pelo art. 10, § 2º, da MP 2.200-2/2001 (meio admitido pelas partes) e Lei 14.063/2020, art. 4º, II.", // simulador (PDD §10.4.2 e §18)
  },
  preview: {
    titulo: "Preview do ATTA Sign", // PDD §10.4.2
    subtitulo: "Selo de assinatura ao vivo", // simulador
    marca: "Sign", // simulador (ao lado do monograma e da palavra ATTA)
    marcaFalada: "ATTA Sign", // provisório (nome da marca para leitor de tela)
    incluso: "ATTA Sign · incluso", // simulador (chip)
    cnpj: (cnpj: string) => `CNPJ ${cnpj}`, // simulador
    rt: "Responsável Técnico:", // simulador
    partes: "Partes institucionais:", // simulador
    partesPorModelo: {
      rt_apenas: "RT", // provisório (o simulador só mostra o do RT + Profissional)
      profissional_apenas: "Profissional executor", // provisório
      rt_profissional: "RT + Profissional executor", // simulador
    } satisfies Record<ModeloDeAssinatura, string>,
    hash: "Hash do preview (SHA-256):", // decisão do CTO, 21/11 (sem "de exemplo")
    codigo: "ATTA-XXXX-XXXX-XXXX", // decisão do CTO, 21/11 (só o formato)
    verificar: "verify.attahub.com.br/[código]", // simulador
    rodape: "Rodapé do termo:", // simulador
    fimDoDocumento: "Fim do documento", // simulador
    semDado: "—", // regra do stage: o que falta aparece como travessão
  },
  documentosDoAtta: {
    titulo: "Documentos do ATTA que o paciente assina", // simulador, captura 46 (R46: só leitura, conferido com o PDD §16)
    subtitulo: "Documentos da plataforma", // simulador
    texto:
      "Além dos documentos da clínica, o paciente aceita documentos padronizados do ATTA, iguais para toda a rede. A clínica não cria, não edita e não configura prazo deles, e eles não aparecem em Termos & Docs. Entram no check-in sozinhos, sem nenhuma ação da recepção.", // simulador (PDD §17.2: documento padronizado da ATTA, não criado nem editado pela clínica)
    legenda: "Tabela dos documentos do ATTA: como e quando o paciente aceita, e a validade", // provisório (legenda da tabela, só leitor de tela)
    colunas: { documento: "Documento do ATTA", como: "Como o paciente aceita", quando: "Quando aparece no check-in", validade: "Validade" }, // simulador
    linhas: [
      {
        documento: "Termo de Uso do Check-in Digital (Paciente)", // PDD §16 / §17.2
        como: "Aceite por clique, depois de ler o texto até o fim. Não usa ATTA Sign.", // simulador (PDD §16: "Aceito os termos" só no fim do texto)
        quando: "No primeiro check-in do paciente (CPF), em qualquer clínica que use o ATTA-in. Depois só volta se sair uma versão nova.", // simulador (PDD RN-TUC-01 a 03)
        validade: "Sem prazo: vale até mudar a versão.", // simulador (PDD §17.2, RN-TUC-01)
      },
      {
        documento: "Aviso de Privacidade do Paciente e Registro de Ciência", // PDD §17.2
        como: "Confirmação de leitura com o ATTA Sign.", // simulador
        quando: "No primeiro check-in do paciente, uma única vez para toda a rede. Volta quando vence ou quando sai versão nova com mudança relevante.", // simulador (PDD §17.2: uma vez por CPF, para toda a rede)
        validade: "12 meses, fixos da plataforma.", // PDD §17.2 ("12 meses, fixo da plataforma (não configurável)")
      },
      {
        documento: "Quadro de Identificação da Controladora", // PDD §16 / §17.2
        detalhe: "dados da própria clínica: nome fantasia, CNPJ, Responsável Técnico, WhatsApp e e-mail", // simulador
        como: "Só ciência (\"Estou ciente\").", // simulador
        quando: "No primeiro atendimento do paciente em cada clínica, logo depois do Aviso. Aparece de novo se algum desses dados mudar.", // simulador (PDD §17.2: por Estabelecimento)
        validade: "Sem prazo: acompanha os dados do Perfil da Clínica.", // simulador
      },
    ],
    nota: "Antes do primeiro Termo ou Aviso pendente, o paciente vê uma tela de aviso inicial, com o botão \"Continuar\", explicando que esses documentos são aceitos uma única vez, ficam disponíveis no ATTA me (Conta) e valem em todas as clínicas que usam o ATTA-in. Quem já aceitou não vê essa tela de novo.", // simulador (PDD §16, RN-TUC-05)
  },
  validade: {
    titulo: "Validade documental", // simulador, captura 46 (R46: só leitura)
    subtitulo: "Frequência e prazo", // simulador
    texto:
      "A validade de cada modelo \"Única\" é de 3, 6 ou 12 meses, ou indeterminada, e muda numa nova versão do modelo, em Termos & Docs. A nova validade vale só para os próximos documentos.", // provisório (PDD RN-V-01; R46: sem edição aqui)
    legenda: "Modelos de frequência Única e a validade de cada um", // provisório (legenda da tabela)
    colunas: { modelo: "Modelo \"Única\"", estado: "Estado", validade: "Validade", obrigatorio: "Obrigatório" }, // simulador (Validade em meses, RN-V-01)
    meses: (n: 3 | 6 | 12 | null) => (n === null ? "Indeterminada" : `${n} meses`), // PDD RN-V-01
    estados: { rascunho: "Rascunho", ativo: "Ativo", inativo: "Inativo" }, // PDD §10.3.1
    obrigatorio: { sim: "Obrigatório", nao: "Opcional", semEscolha: "—" }, // simulador / RN-DOC-04
    versao: (v: number) => `v${v}`, // simulador
    abrir: "Abrir em Termos & Docs", // provisório (cada linha leva ao modelo; R46)
    abrirFalado: (titulo: string) => `Abrir ${titulo} em Termos & Docs`, // provisório
    nenhum: "Nenhum modelo \"Única\" ativo.", // provisório
    porProcedimento: (nomes: string[]) =>
      nomes.length === 0 ? "" : `${nomes.length} modelo(s) "Por procedimento" sem validade: ${nomes.join(", ")}.`, // simulador (rodapé)
    erro: "Não conseguimos carregar os modelos agora.", // provisório
  },
  semRt: {
    destaque: "Falta o Responsável Técnico.", // provisório (rt_complete = false; CTO, 21/11)
    texto: "O modelo escolhido inclui a assinatura do RT, e o Perfil da Clínica ainda não tem RT. Os documentos só ficam definitivos depois que ele for cadastrado em Perfil da Clínica.", // provisório (PDD §10.4.1, CA-E01-02)
  },
  salvo: "Modelo salvo", // provisório (anúncio para leitor de tela)
  erros: {
    SEM_PERMISSAO: "Só o gestor da clínica muda as Configurações.", // provisório (o mesmo das outras seções)
    outro: "Não conseguimos salvar agora. Tente de novo em instantes.", // provisório (o mesmo das outras seções)
  },
} as const;
