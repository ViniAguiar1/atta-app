import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

// PROpass do profissional (MIG-55; PDD §10.4.3) com a porta simulada, em 360 px, e axe a cada passo. CPF gerado e
// nomes fictícios; valores de teste no migracao/guia-de-teste.md, nunca na tela.
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });

const LINK = `/propass/${"conv".padEnd(43, "A")}`;
const axe = async (page: Page) => {
  await expect(page).toHaveTitle(/PROpass/); // o <title> chega por streaming; o axe roda depois dele
  return (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
};

test("do convite ao conselho regularizado, sem dado pessoal na URL", async ({ page }) => {
  await page.request.get(LINK); // a pré-visualização do e-mail não gasta o link
  await page.goto(LINK);
  expect(page.url()).toMatch(/\/propass$/);
  await expect(page.getByRole("heading", { level: 1, name: "Confirme quem é você" })).toBeVisible();
  await expect(page.getByLabel("E-mail profissional")).toHaveAttribute("readonly", "");
  expect(await axe(page)).toEqual([]);

  await page.getByLabel("Nome completo").fill("Bruna Reis");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByLabel("WhatsApp de contato").fill("11987654321");
  await page.getByLabel("Conselho").selectOption("crm");
  await page.getByLabel("Número de registro").fill("201577");
  await page.getByLabel("UF").selectOption("SP");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Camada 1 — Validação ATTA (Conselho)" })).toBeVisible();
  await expect(page.getByText("Regularizado (Conselho Ativo)")).toBeVisible();
  expect(page.url()).not.toMatch(/52998224725|11987654321/);
  expect(await axe(page)).toEqual([]);
});

test("convite inválido mostra só o aviso, sem formulário", async ({ page }) => {
  await page.goto("/propass/curto-demais");
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test("nenhum texto de ambiente nem dica de teste na tela", async ({ page }) => {
  await page.goto(LINK);
  await expect(page.getByLabel("CPF")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/ambiente de valida|fict[ií]ci|\bdemo|\bteste\b|exemplo válido/i);
});
