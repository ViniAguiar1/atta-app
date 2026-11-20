import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // tests/conformance: os vetores congelados do atta-core (ATTA Sign) ficam em tests/vectors, fora do src;
    // scripts: o gerador dos modelos de e-mail do Auth (scripts/modelos-email)
    include: ["src/**/*.test.{ts,tsx}", "tests/conformance/**/*.test.ts", "scripts/**/*.test.ts"],
    // server-only quebra fora do Next; nos testes de unidade ele vira um módulo vazio
    alias: { "server-only": new URL("./vitest.server-only.ts", import.meta.url).pathname },
  },
});
