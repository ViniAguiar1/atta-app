import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

// PROpass do profissional (MIG-55; PDD §10.4.3) com a porta real, em 360 px, contra o Supabase local do CI. O seed não
// tem um convite pendente com segredo conhecido: aqui entram o link (que não gasta o convite) e o convite sem validade.
// O fluxo inteiro (dados, conselho, termo, assinatura, senha e envio) está nos testes de componente, e o envio de ponta
// a ponta com o banco é feito na prévia (Backend 4, lista a–e do Tech Lead).
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });

const axe = async (page: Page) => {
  await expect(page).toHaveTitle(/PROpass/);
  return (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
};

test("o link guarda o cookie e manda para /propass sem o segredo; convite desconhecido mostra só o aviso", async ({ page }) => {
  const segredo = "y".repeat(43);
  await page.request.get(`/propass/${segredo}`); // a pré-visualização do e-mail não gasta o link
  await page.goto(`/propass/${segredo}`);
  expect(page.url()).toMatch(/\/propass$/);
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/ambiente de valida|fict[ií]ci|\bdemo|\bteste\b/i);
  expect(await axe(page)).toEqual([]);
});

test("segredo fora do formato: o mesmo aviso, sem formulário", async ({ page }) => {
  await page.goto("/propass/curto-demais");
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
