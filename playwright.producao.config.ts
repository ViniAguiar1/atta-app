import { defineConfig, devices } from "@playwright/test";

// e2e de PRODUÇÃO (job "build + e2e com axe", depois do e2e normal): o app buildado e servido com
// VERCEL_ENV=production. Prova o que só existe na produção, como as rotas com porta simulada (check-in, Boarding
// Check, /b) responderem 404 (S3-4; stage = produção). Specs em e2e/producao/, uma por jornada, sem login.
// Rodar: VERCEL_ENV=production pnpm build && pnpm test:e2e:producao
const porta = Number(process.env.PORT_PRODUCAO ?? 3100);

export default defineConfig({
  testDir: "./e2e/producao",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${porta}`, trace: "retain-on-failure" },
  projects: [{ name: "producao", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node_modules/.bin/next start --port ${porta}`,
    url: `http://127.0.0.1:${porta}/api/health`,
    env: { VERCEL_ENV: "production" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
