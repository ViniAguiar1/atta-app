import { expect, test } from "@playwright/test";

// PROpass na produção (MIG-55): com a porta real, /propass deixa de dar 404 (S3-4) e abre. Sem o cookie do convite, a
// tela é o aviso de convite sem validade, sem formulário nem dado de ninguém.
test("na produção, /propass abre com a porta real e, sem convite, mostra só o aviso", async ({ page }) => {
  const resposta = await page.goto("/propass");
  expect(resposta?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
});

test("na produção, o link do convite guarda o cookie e manda para /propass, sem o segredo na URL", async ({ request }) => {
  const r = await request.get(`/propass/${"x".repeat(43)}`, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(r.headers()["location"]).toBe("/propass");
  expect(r.headers()["set-cookie"]).toMatch(/atta_propass_link=.*HttpOnly/i);
});
