import { expect, test } from "@playwright/test";

// MIG-40, regra do stage (PLANO e ADR 0001 §4): sem sessão, o painel leva à tela de entrar. A barra com sessão (cores,
// foco, abas inteiras, fonte do ATTA) volta ao e2e com o login da gestora do seed no MIG-03b (Backend 1), que sobe o
// Supabase local no CI; até lá ela está coberta pelo BarraDoPainel.test.tsx e pela validação do QA no #11.
for (const caminho of ["/", "/painel", "/painel/agenda", "/painel/configuracoes", "/painel/inexistente"]) {
  test(`${caminho} sem sessão vai para a tela de entrar`, async ({ page }) => {
    await page.goto(caminho);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
  });
}

test("rota fora do painel continua na página de não encontrada, sem indexar", async ({ page }) => {
  await page.goto("/inexistente");
  await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
