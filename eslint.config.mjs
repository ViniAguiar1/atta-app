import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { seletoresDeBreakpoint } from "./eslint-rules/breakpoints.mjs";
import { seletoresDeCor } from "./eslint-rules/cores.mjs";
import { fronteiras } from "./eslint-rules/fronteiras.mjs";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { pluginDoTema } from "./eslint-rules/tamanho-de-texto.mjs";

// A secret key passa por cima da RLS: só entra onde o código roda no servidor e confere o papel (ADR 0001 §4).
const SO_SERVIDOR = {
  patterns: [
    {
      // por alias e por caminho relativo (./env.server dentro de src/lib, ./admin dentro de src/lib/supabase)
      group: ["@/lib/supabase/admin", "@/lib/env.server", "**/env.server", "**/supabase/admin", "./admin", "../supabase/admin"],
      message: "Secret key só em src/server/**, **/actions.ts e app/**/route.ts, conferindo o papel antes (ADR 0001 §4).",
    },
  ],
};

// Classes do src/styles/globals.css que não são do Tailwind (moldura do site na tela de entrar, #136): a regra de classe
// desconhecida não as cobra. Classe nova de CSS próprio entra aqui, com o arquivo que a define.
const CLASSES_PROPRIAS = ["^sobre-marca$", "^cartao-do-site$"];

// HTML cru (ADR 0004 §3b): reaproveitado nos dois blocos de no-restricted-syntax abaixo.
const HTML_CRU = [
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: "HTML cru é proibido (ADR 0004 §3b): use texto pelo React.",
  },
  {
    selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]",
    message: "HTML cru é proibido (ADR 0004 §3b): use texto pelo React.",
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  fronteiras, // feature não importa de outra feature (ADR 0001 §4; regra do Frontend)
  // as fixtures do Playwright chamam use(), que o rules-of-hooks confunde com hook do React
  { files: ["e2e/**/*.ts"], rules: { "react-hooks/rules-of-hooks": "off" } },
  { rules: { "no-restricted-imports": ["error", SO_SERVIDOR], "no-console": "error" } },
  // HTML cru e código montado em texto: proibidos (ADR 0004 §3b, condição do Tech Lead para a CSP com 'unsafe-inline';
  // auditoria de segurança S2-1). Texto de clínica, paciente ou profissional entra sempre como texto, pelo React.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react/no-danger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-syntax": ["error", ...HTML_CRU],
    },
  },
  // Classes do tema (regras do Frontend, ADR 0001 §6): cor só por token e breakpoint só do tema. No-restricted-syntax é
  // uma regra só e o último bloco vence, então este repete o HTML cru e fica depois dele (nos testes, só o HTML cru).
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...HTML_CRU, ...seletoresDeCor, ...seletoresDeBreakpoint] },
  },
  // Tamanho de texto só por token (ADR 0001 §6): aviso para text-[…] solto, regra própria para não disputar o
  // no-restricted-syntax de cima. Nos testes, não se cobra.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    plugins: { tema: pluginDoTema },
    rules: { "tema/tamanho-de-texto": "warn" },
  },
  // Classe que o tema não gera (Tech Lead Frontend, 21/11): o tokens.theme.css zera escalas do Tailwind (raio, texto,
  // breakpoint, cor), e uma classe como rounded-xl some sem aviso do build. Esta regra lê o tema de verdade
  // (src/styles/globals.css) e avisa (warn). As classes próprias do globals.css ficam em CLASSES_PROPRIAS, num só lugar.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    plugins: { "better-tailwindcss": betterTailwindcss },
    settings: { "better-tailwindcss": { entryPoint: "src/styles/globals.css" } },
    rules: { "better-tailwindcss/no-unknown-classes": ["warn", { ignore: CLASSES_PROPRIAS }] },
  },
  // o único lugar com console.*: o logger, que escreve JSON sem dado pessoal (ADR 0001 §5)
  { files: ["src/lib/logger.ts"], rules: { "no-console": "off" } },
  {
    files: ["src/server/**", "**/actions.ts", "src/app/**/route.ts", "src/lib/supabase/admin.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"]),
]);
