import { expect, test } from "@playwright/test";

// Stage = produção (PLANO; S3-4 da Segurança): enquanto a porta do Boarding Check for a simulada, /b/* e /boarding
// respondem 404 na produção. Só roda contra um build e um servidor com VERCEL_ENV=production (a guarda da página é
// avaliada no build, por causa do prerender parcial):
//   VERCEL_ENV=production pnpm build && VERCEL_ENV=production PORT=3100 pnpm exec playwright test e2e/boarding-producao.spec.ts --project chromium --no-deps
// Na prévia, o e2e/boarding.spec.ts prova a tela normal.
test.skip(process.env.VERCEL_ENV !== "production", "só contra o build de produção");

test("na produção, o link e o /boarding respondem 404, sem cookie nem formulário", async ({ page, request }) => {
  const link = await request.get(`/b/${"vale".padEnd(43, "A")}`, { maxRedirects: 0 });
  expect(link.status()).toBe(404);
  expect(link.headers()["set-cookie"]).toBeUndefined();

  const tela = await page.goto("/boarding");
  expect(tela?.status()).toBe(404);
  await expect(page.getByLabel("Senha")).toHaveCount(0);
});
