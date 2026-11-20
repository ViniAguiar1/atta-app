// Seções de Configurações em grupos, na ordem do menu lateral (PDD v206 §10.4.0 a §10.4.9; Simulador ATTA-in, captura 02 e
// README). Regra do stage (CTO) e do Tech Lead Frontend: seção sem tela fica "nunca"; com a porta simulada, "fora-da-producao";
// com a porta real, "sempre". Cada seção muda quando a tela entra e quando a porta real entra.
export type Secao = { caminho: string; titulo: string; exibir: "sempre" | "fora-da-producao" | "nunca" };
export type Grupo = { titulo: string; secoes: Secao[] };

export const BASE = "/painel/configuracoes";

export const GRUPOS: Grupo[] = [
  { titulo: "Início", secoes: [{ caminho: "visao-geral", titulo: "Visão geral", exibir: "nunca" }] }, // simulador
  {
    titulo: "Clínica", // simulador
    secoes: [
      { caminho: "perfil", titulo: "Perfil da Clínica", exibir: "nunca" }, // PDD §10.4.1
      { caminho: "equipe", titulo: "Equipe & Permissões", exibir: "nunca" }, // PDD §10.4.3
      { caminho: "servicos", titulo: "Serviços", exibir: "nunca" }, // PDD §10.4.7
    ],
  },
  {
    titulo: "Agendamentos", // simulador
    secoes: [
      { caminho: "agendamentos", titulo: "Agendamentos", exibir: "sempre" }, // simulador (PDD §10.2.1 remete a Configurações > Agendamentos)
      { caminho: "integracoes", titulo: "Integrações", exibir: "nunca" }, // PDD §10.4.5
      { caminho: "notificacoes", titulo: "Notificações", exibir: "nunca" }, // PDD §10.4.6
    ],
  },
  {
    titulo: "Documentos", // simulador
    secoes: [
      { caminho: "assinaturas", titulo: "Assinaturas & Validade", exibir: "nunca" }, // PDD §10.4.2
      { caminho: "termos", titulo: "Termos & Políticas", exibir: "nunca" }, // simulador
    ],
  },
  { titulo: "Pacientes", secoes: [{ caminho: "importacao", titulo: "Importação de pacientes", exibir: "nunca" }] }, // simulador
  {
    titulo: "Conta", // simulador
    secoes: [
      { caminho: "minha-assinatura", titulo: "Minha Assinatura", exibir: "nunca" }, // PDD §10.4.8
      { caminho: "onboarding", titulo: "Onboarding", exibir: "nunca" }, // simulador
      { caminho: "auditoria", titulo: "Auditoria", exibir: "nunca" }, // PDD §10.4.3
    ],
  },
];

export const urlDaSecao = (caminho: string) => `${BASE}/${caminho}`;

/** A seção abre? `emProducao` vem de casca/abas.ts, no servidor. */
export const secaoDisponivel = (secao: Secao, emProducao: boolean) =>
  secao.exibir === "sempre" || (secao.exibir === "fora-da-producao" && !emProducao);

/** Só os grupos com alguma seção disponível, e só as seções disponíveis de cada um. */
export function gruposDisponiveis(emProducao: boolean, grupos: Grupo[] = GRUPOS): Grupo[] {
  return grupos
    .map((g) => ({ ...g, secoes: g.secoes.filter((s) => secaoDisponivel(s, emProducao)) }))
    .filter((g) => g.secoes.length > 0);
}

export const primeiraSecaoDisponivel = (emProducao: boolean, grupos: Grupo[] = GRUPOS) =>
  gruposDisponiveis(emProducao, grupos)[0]?.secoes[0];

export const secaoPorCaminho = (caminho: string, grupos: Grupo[] = GRUPOS) =>
  grupos.flatMap((g) => g.secoes).find((s) => s.caminho === caminho);
