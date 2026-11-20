// Seções de Configurações em grupos, na ordem do menu lateral (PDD v206 §10.4.0 a §10.4.9; Simulador ATTA-in, captura 02 e
// README). Regra do stage (decisão do CTO): seção sem tela não aparece; cada uma liga `pronta` quando a tela entrar.
export type Secao = { caminho: string; titulo: string; pronta: boolean };
export type Grupo = { titulo: string; secoes: Secao[] };

export const BASE = "/painel/configuracoes";

export const GRUPOS: Grupo[] = [
  { titulo: "Início", secoes: [{ caminho: "visao-geral", titulo: "Visão geral", pronta: false }] }, // simulador
  {
    titulo: "Clínica", // simulador
    secoes: [
      { caminho: "perfil", titulo: "Perfil da Clínica", pronta: false }, // PDD §10.4.1
      { caminho: "equipe", titulo: "Equipe & Permissões", pronta: false }, // PDD §10.4.3
      { caminho: "servicos", titulo: "Serviços", pronta: false }, // PDD §10.4.7
    ],
  },
  {
    titulo: "Agendamentos", // simulador
    secoes: [
      { caminho: "agendamentos", titulo: "Agendamentos", pronta: false }, // simulador (PDD §10.2.1 remete a Configurações > Agendamentos)
      { caminho: "integracoes", titulo: "Integrações", pronta: false }, // PDD §10.4.5
      { caminho: "notificacoes", titulo: "Notificações", pronta: false }, // PDD §10.4.6
    ],
  },
  {
    titulo: "Documentos", // simulador
    secoes: [
      { caminho: "assinaturas", titulo: "Assinaturas & Validade", pronta: false }, // PDD §10.4.2
      { caminho: "termos", titulo: "Termos & Políticas", pronta: false }, // simulador
    ],
  },
  { titulo: "Pacientes", secoes: [{ caminho: "importacao", titulo: "Importação de pacientes", pronta: false }] }, // simulador
  {
    titulo: "Conta", // simulador
    secoes: [
      { caminho: "minha-assinatura", titulo: "Minha Assinatura", pronta: false }, // PDD §10.4.8
      { caminho: "onboarding", titulo: "Onboarding", pronta: false }, // simulador
      { caminho: "auditoria", titulo: "Auditoria", pronta: false }, // PDD §10.4.3
    ],
  },
];

export const urlDaSecao = (caminho: string) => `${BASE}/${caminho}`;

/** Só os grupos com alguma seção pronta, e só as seções prontas de cada um. */
export function gruposProntos(grupos: Grupo[] = GRUPOS): Grupo[] {
  return grupos.map((g) => ({ ...g, secoes: g.secoes.filter((s) => s.pronta) })).filter((g) => g.secoes.length > 0);
}

export const primeiraSecaoPronta = (grupos: Grupo[] = GRUPOS) => gruposProntos(grupos)[0]?.secoes[0];
