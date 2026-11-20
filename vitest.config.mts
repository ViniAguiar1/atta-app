import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // server-only quebra fora do Next; nos testes de unidade ele vira um módulo vazio
    alias: { "server-only": new URL("./vitest.server-only.ts", import.meta.url).pathname },
  },
});
