import { defineConfig } from "vitest/config";

// Só para rodar o seed (rodar.seed.ts) com os módulos de cifra do app; fora da suíte normal.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["scripts/seed-nuvem/rodar.seed.ts"],
    alias: { "server-only": new URL("../../vitest.server-only.ts", import.meta.url).pathname },
  },
});
