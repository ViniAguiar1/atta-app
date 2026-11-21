import { defineConfig, devices } from "@playwright/test";

const porta = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["producao/**"], // e2e de produção: playwright.producao.config.ts, com build próprio
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? undefined : 1, // Mac compartilhado pelos agentes: um navegador por vez fora do CI
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${porta}`, trace: "retain-on-failure" },
  projects: [
    // entra uma vez (senha e TOTP da gestora do seed) e guarda a sessão em e2e/.auth, fora do git
    { name: "entrar", testMatch: /.*\.setup\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["entrar"] },
  ],
  webServer: {
    command: `node_modules/.bin/next start --port ${porta}`, // direto: o pnpm 12 deixaria o next vivo e o teste nunca terminaria
    url: `http://127.0.0.1:${porta}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
