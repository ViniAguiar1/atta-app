import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { coresSoPorToken } from "./eslint-rules/cores.mjs";
import { fronteiras } from "./eslint-rules/fronteiras.mjs";

// A secret key passa por cima da RLS: só entra onde o código roda no servidor e confere o papel (ADR 0001 §4).
const SO_SERVIDOR = {
  patterns: [
    {
      group: ["@/lib/supabase/admin", "@/lib/env.server", "**/lib/supabase/admin", "**/lib/env.server"],
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
  // o único lugar com console.*: o logger, que escreve JSON sem dado pessoal (ADR 0001 §5)
  { files: ["src/lib/logger.ts"], rules: { "no-console": "off" } },
  {
    files: ["src/server/**", "**/actions.ts", "src/app/**/route.ts", "src/lib/supabase/admin.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/lib/supabase/database.types.ts"]),
]);
