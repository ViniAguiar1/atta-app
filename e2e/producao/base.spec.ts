import { expect, test } from "@playwright/test";

// Base do e2e de produção (DevEx): o app sobe com VERCEL_ENV=production e rota que não existe responde 404.
// As jornadas com porta simulada entram aqui ao lado, uma spec por jornada (ex.: checkin.spec.ts, boarding.spec.ts),
// provando o 404 de cada rota na produção.
test("o app de produção responde na saúde", async ({ request }) => {
  const resposta = await request.get("/api/health");
  expect(resposta.status()).toBe(200);
  expect((await resposta.json()).status).toBe("ok");
});

test("rota que não existe dá 404 na produção", async ({ page }) => {
  const resposta = await page.goto("/rota-que-nao-existe-na-producao");
  expect(resposta?.status()).toBe(404);
});
