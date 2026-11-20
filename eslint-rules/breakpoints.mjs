// Breakpoint só do tema (Guia de Design §6; planning/05 §4.4; ADR 0001 §6). O tokens.theme.css zera os breakpoints do
// Tailwind (--breakpoint-*: initial) e define medium (600 px), expanded (840 px), large (1200 px) e extra-large (1600 px).
// sm:, md:, lg:, xl: e 2xl: (e as formas max-*) não geram CSS nenhum: a classe some sem aviso do build, do axe nem do
// CI. Esta regra reprova esses prefixos em qualquer texto de classe (string e template) em TS/TSX.
const PADRAO = String.raw`/(^|[\s:])(max-)?(sm|md|lg|xl|2xl):/`;

const MENSAGEM =
  "breakpoint só do tema: medium (600 px), expanded (840 px), large (1200 px) e extra-large (1600 px); sm:, md:, lg:, xl: e 2xl: não existem aqui e não geram CSS (ADR 0001 §6)";

const emTexto = (regex) => `:matches(Literal[value=${regex}], TemplateElement[value.raw=${regex}])`;

export const seletoresDeBreakpoint = [{ selector: emTexto(PADRAO), message: MENSAGEM }];
