import { expect, test } from "@playwright/test";

// Boarding Check na produção (MIG-23 parte 3b): com a porta real, /b e /boarding deixam de dar 404 (S3-4) e abrem. Sem o
// cookie do link, a tela é só o aviso de link sem validade, sem campo de senha nem dado de ninguém. O PIN não é
// conferido aqui: a produção recusa o pepper de teste do CI (pepperFromEnv), e o fluxo com o banco está no
// e2e/boarding.spec.ts.
test("na produção, /boarding abre com a porta real e, sem link, mostra só o aviso", async ({ page }) => {
  const resposta = await page.goto("/boarding");
  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Este link não vale mais." })).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveCount(0);
});

test("na produção, o link guarda o cookie em /boarding e manda para /boarding, sem o segredo na URL", async ({ request }) => {
  const r = await request.get(`/b/${"x".repeat(43)}`, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(r.headers()["location"]).toBe("/boarding");
  expect(r.headers()["set-cookie"]).toMatch(/atta_boarding_link=.*HttpOnly/i);
  expect(r.headers()["set-cookie"]).toMatch(/Path=\/boarding/i);
});
