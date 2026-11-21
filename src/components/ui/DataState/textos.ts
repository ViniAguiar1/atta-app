// Textos comuns dos quatro estados de dados (planning/05 §4.5). O PDD e o Guia de Design não definem esses textos
// (levado ao CTO no ENG-160); o vazio de cada tela tem título e ação próprios.
export const textos = {
  carregando: "Carregando…",
  semResultado: {
    titulo: "Nenhum resultado para os filtros aplicados",
    texto: "Mude a busca ou limpe os filtros para ver tudo de novo.",
    acao: "Limpar filtros",
  },
  // sem permissão no módulo (PDD §10.4.3: o acesso do Colaborador é módulo a módulo). Provisório, listado ao CTO.
  semAcesso: {
    titulo: "Você não tem acesso a este módulo",
    texto: "Quem libera o acesso é o gestor da clínica, em Configurações › Equipe & Permissões.",
  },
  erro: {
    titulo: "Não foi possível carregar os dados",
    texto: "Confira a conexão e tente de novo. Se continuar, fale com o suporte.",
    acao: "Tentar de novo",
    codigo: "Código para o suporte:",
  },
} as const;
