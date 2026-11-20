// Cor só por token (Guia de Design §1.3; ADR 0001 §6). Porte de eslint-rules/cores.js dos painéis antigos
// (atta-web-clinic e atta-web-patient, ATIN-32). Em TS/TSX, reprova:
// - cor (hex ou função de cor, color-mix inclusive: mistura é cor nova, sem contraste conferido) dentro de valor
//   arbitrário do Tailwind, como bg-[#fff] ou shadow-[0_0_0_2px_#fff];
// - a camada --ref-* dos tokens (só os tokens semânticos vão para componente);
// - qualquer cor crua no atributo style.
// As classes de cor genéricas do Tailwind (bg-gray-*, text-red-*...) nem existem: o @theme do tokens.theme.css as zera.
export const COR = String.raw`(?:#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\()`;

const MENSAGEM =
  "cor só por token do @theme (bg-brand, text-text-primary...): nada de cor arbitrária, --ref-* ou cor crua no style (ADR 0001 §6)";
const emTexto = (regex) => `:matches(Literal[value=${regex}], TemplateElement[value.raw=${regex}])`;

export const seletoresDeCor = [
  emTexto(String.raw`/\[[^\]]*${COR}/`),
  emTexto("/--ref-/"),
  `JSXAttribute[name.name="style"] ${emTexto(`/${COR}/`)}`,
].map((selector) => ({ selector, message: MENSAGEM }));

// No flat config, no-restricted-syntax é uma regra só, e o último bloco que a define vence: os seletores de cor entram
// junto com os outros, num bloco único, no eslint.config.mjs (antes, um bloco posterior os apagava sem aviso).
