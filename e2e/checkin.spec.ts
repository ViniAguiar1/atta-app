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
  await expect(page.getByRole("heading", { name: "Confirme Seus Dados" })).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  // §11.5: edição aberta (com o nome social marcado) também passa no axe
  await page.getByRole("button", { name: "Editar informações" }).click();
  await page.getByRole("checkbox", { name: "Informar nome social" }).check();
  expect((await axe(page)).violations).toEqual([]);
  expect(page.url()).toMatch(/\/checkin\/aurora$/);
});

// Com o prerender parcial, o notFound() chega depois do shell: o status fica 200 e a tela é a de 404.
test("portal inexistente mostra a página de não encontrado, sem o formulário", async ({ page }) => {
  await page.goto("/checkin/nao-existe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/não encontrada|404/i);
  await expect(page.getByLabel("CPF")).toHaveCount(0);
});

// Regra do dono (PLANO, "O stage é uma réplica exata da produção"): nenhum texto de ambiente nem dica de teste na tela.
test("nenhum texto de ambiente nem dica do código em nenhum passo", async ({ page }) => {
  const proibido = /ambiente de valida|fict[ií]ci|\bdemo|\bteste\b|123456/i;
  await page.goto("/checkin/aurora");
  await expect(page.getByLabel("CPF")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(proibido);
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await expect(page.getByLabel("Código")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(proibido);
});

// QA no #29: "cadastro novo" traz só o CPF confirmado, com os outros campos vazios e abertos (CPF gerado, guia de teste).
test("cadastro novo abre a Confirme Seus Dados vazia, só com o CPF confirmado", async ({ page }) => {
  await page.goto("/checkin/aurora");
  await page.getByLabel("CPF").fill("11144477735");
  await page.getByRole("button", { name: "Enviar código" }).click();
  await page.getByLabel("Código").fill("123456");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("heading", { name: "Confirme Seus Dados" })).toBeVisible();
  await expect(page.getByText("Não encontramos seu cadastro — vamos criar um novo, é rápido.")).toBeVisible();
  await expect(page.getByText("···.···.777-35")).toBeVisible();
  await expect(page.getByLabel("Nome completo")).toHaveValue("");
  await expect(page.getByLabel("Celular")).toHaveValue("");
});
