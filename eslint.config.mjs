import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { coresSoPorToken } from "./eslint-rules/cores.mjs";
import { fronteiras } from "./eslint-rules/fronteiras.mjs";

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

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  coresSoPorToken, // cor só por token (ADR 0001 §6; regra do Frontend)
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
      "no-restricted-syntax": [
        "error",
        {
          selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
          message: "HTML cru é proibido (ADR 0004 §3b): use texto pelo React.",
        },
        {
          selector: "CallExpression[callee.property.name=/^(insertAdjacentHTML|write|writeln)$/]",
          message: "HTML cru é proibido (ADR 0004 §3b): use texto pelo React.",
        },
      ],
    },
  },
  // o único lugar com console.*: o logger, que escreve JSON sem dado pessoal (ADR 0001 §5)
  { files: ["src/lib/logger.ts"], rules: { "no-console": "off" } },
  {
    files: ["src/server/**", "**/actions.ts", "src/app/**/route.ts", "src/lib/supabase/admin.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"]),
]);
