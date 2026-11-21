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
