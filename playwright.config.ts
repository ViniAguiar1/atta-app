import { defineConfig, devices } from "@playwright/test";

const porta = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${porta}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node_modules/.bin/next start --port ${porta}`, // direto: o pnpm 12 deixaria o next vivo e o teste nunca terminaria
    url: `http://127.0.0.1:${porta}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
