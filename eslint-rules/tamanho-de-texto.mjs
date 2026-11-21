// Tamanho de texto só por token do tema (ADR 0001 §6; decisão do Tech Lead Frontend, 21/11). A escala do painel tem
// text-xs (12 px), text-sm (14 px) e os tokens text-corpo (13 px), text-rotulo (11 px), text-numero (26 px),
// text-numero-menor (22 px) e text-destaque (36 px), no
// tokens.theme.css. Valor solto como text-[0.8125rem] ou text-[13px] vira aviso: o código antigo troca quando o dono
// passar pela tela, e o novo já nasce com o token. É aviso (warn), não erro, para não travar as telas que já existem.
const PADRAO = /(^|[\s:])text-\[[\d.]+(rem|px|em)\]/;

const MENSAGEM =
  "tamanho de texto só por token (ADR 0001 §6): text-xs (12 px), text-sm (14 px), text-corpo (13 px), text-rotulo (11 px), text-numero (26 px), text-numero-menor (22 px) ou text-destaque (36 px)";

const regra = {
  meta: { type: "suggestion", docs: { description: MENSAGEM }, schema: [] },
  create(context) {
    const conferir = (node, texto) => {
      if (typeof texto === "string" && PADRAO.test(texto)) context.report({ node, message: MENSAGEM });
    };
    return {
      Literal: (node) => conferir(node, node.value),
      TemplateElement: (node) => conferir(node, node.value.raw),
    };
  },
};

export const pluginDoTema = { rules: { "tamanho-de-texto": regra } };
