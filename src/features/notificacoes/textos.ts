import type { Grupo } from "./formato";

// Textos da Caixa de notificações (MIG-45). Fonte: o Simulador ATTA-in (captura 41), que vale para o visual e os textos
// de interface (decisão do dono de 20/11), e o PDD v206 §21 e §10.4.6 para a regra. Ficam fora as referências a regra
// ("RN-NOT-01 · CA-E13-03"), que o PDD §10 proíbe na interface. O que não está no simulador é provisório.
export const textos = {
  titulo: "Notificações", // PDD §10 (sino de Atividades); o h1 é só para o leitor de tela
  subabas: { rotulo: "Seções de Notificações", caixa: "Caixa de notificações" }, // rótulo: provisório; caixa: simulador, captura 41
  busca: { rotulo: "Buscar notificações", placeholder: "Buscar no título ou corpo" }, // rótulo: provisório; placeholder: simulador, captura 41
  grupos: { hoje: "Hoje", ontem: "Ontem", anteriores: "Anteriores" } satisfies Record<Grupo, string>, // Hoje e Ontem: simulador, captura 41; Anteriores: provisório
  naoLida: "Não lida", // simulador, captura 41
  lista: "Notificações", // provisório (nome da lista para o leitor de tela)
  destinos: {
    agenda: "Ir para Agendamentos", // simulador, captura 41
    pacientes: "Ir para Pacientes", // provisório
    documentos: "Ir para Termos & Docs", // simulador, captura 41
    equipe: "Ir para Equipe", // simulador, captura 41
    configuracoes: "Ir para Configurações", // provisório
  },
  vazio: { titulo: "Nenhuma notificação", texto: "O que acontece na clínica aparece aqui, em linguagem simples." }, // provisório
  canais: {
    titulo: "Como as notificações chegam", // simulador, captura 41
    sino: "Sino do painel", sinoDetalhe: "não configurável", sempreAtivo: "Sempre ativo", // simulador, captura 41
    email: "E-mail", whatsapp: "WhatsApp", // simulador, captura 41
    pausa: "Pausa noturna", pausaDetalhe: "22h às 07h: só o sino", // simulador, captura 41 (PDD §10.4.6)
    resumo: "Resumo operacional", // simulador, captura 41
    resumos: { tempo_real: "Tempo real", diario: "Diário consolidado", semanal: "Semanal consolidado" }, // Tempo real: simulador; os outros: PDD §10.4.6
    ativo: "Ativo", desativado: "Desativado", ativa: "Ativa", desativada: "Desativada", // simulador, captura 41
    semConfiguracao: "—",
    eventos: (comEmail: number, total: number, comWhatsapp: number) =>
      `${comEmail} de ${total} eventos com e-mail · ${comWhatsapp} com WhatsApp. O sino recebe todos.`, // simulador, captura 41
    sinoRecebeTodos: "O sino recebe todos os eventos.", // provisório (sem a contagem dos canais)
    configurar: "Configurar em Configurações › Notificações", // simulador, captura 41
  },
  privacidade: {
    destaque: "Nenhuma notificação contém dado de saúde.", // simulador, captura 41 (sem o código da regra)
    texto: "Envios operacionais não podem ser desligados.", // simulador, captura 41 (sem o código da regra)
  },
} as const;
