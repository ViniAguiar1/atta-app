import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

// Check-in pelo celular (MIG-50) com a porta simulada e CPF gerado (fictício), no tamanho de celular.
test.use({ ...devices["iPhone 13"], defaultBrowserType: "chromium" });

const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test("do CPF ao código, sem CPF na URL e sem violação do axe em cada passo", async ({ page }) => {
  await page.goto("/checkin/aurora");
  await expect(page.getByRole("heading", { level: 1, name: "Check-in" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByText(/celular terminado em 4321/)).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
  expect(page.url()).not.toContain("52998224725");

  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("heading", { name: "Identidade confirmada" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);
});

// Com o prerender parcial, o notFound() chega depois do shell: o status fica 200 e a tela é a de 404.
test("portal inexistente mostra a página de não encontrado, sem o formulário", async ({ page }) => {
  await page.goto("/checkin/nao-existe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/não encontrada|404/i);
  await expect(page.getByLabel("CPF")).toHaveCount(0);
});
