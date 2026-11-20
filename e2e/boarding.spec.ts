import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

// Boarding Check do profissional (MIG-53; PDD §10.2.3; ADR 0004 §3) com a porta simulada, no tamanho de celular.
// Valores de teste no migracao/guia-de-teste.md; nada disso aparece na tela.
// Largura de 360 px (o menor celular comum; regra do Tech Lead Frontend para o axe).
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });

const LINK = `/b/${"vale".padEnd(43, "A")}`;
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test("o GET do link não renderiza nem guarda o segredo na URL, e tem os headers da trava", async ({ request }) => {
  const r = await request.get(LINK, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(r.headers()["location"]).toBe("/boarding");
  expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect(r.headers()["x-robots-tag"]).toBe("noindex");
  expect(r.headers()["set-cookie"]).toMatch(/atta_boarding_link=.*HttpOnly/i);
  expect(r.headers()["set-cookie"]).toMatch(/Path=\/boarding/i);
});

test("pré-visualização repetida não gasta o link; o PIN certo depois abre o atendimento", async ({ page }) => {
  await page.request.get(LINK); // o WhatsApp abre o link antes do profissional
  await page.goto(LINK);
  await page.goto(LINK);
  expect(page.url()).toMatch(/\/boarding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Boarding Check" })).toBeVisible();
  await expect(page).toHaveTitle(/Boarding Check/); // o <title> chega por streaming; o axe roda depois dele
  expect((await axe(page)).violations).toEqual([]);

  await page.getByLabel("Senha").fill("1111");
  await page.getByRole("button", { name: "Ver atendimento" }).click();
  await expect(page.locator("#pin-erro")).toHaveText(/Senha não confere/);
  await expect(page).toHaveTitle(/Boarding Check/); // a action mexe em cookie e o Next renderiza de novo
  expect((await axe(page)).violations).toEqual([]);

  await page.getByLabel("Senha").fill("2468");
  await page.getByRole("button", { name: "Ver atendimento" }).click();
  await expect(page.getByText("Helena Prado Antunes")).toBeVisible();
  expect(page.url()).toMatch(/\/boarding$/);
  await expect(page).toHaveTitle(/Boarding Check/);
  expect((await axe(page)).violations).toEqual([]);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "atta_boarding_link")).toBeUndefined();
  expect(cookies.find((c) => c.name === "atta_grant")?.httpOnly).toBe(true);
});

test("sem link válido, a tela só diz que o link não vale mais", async ({ page }) => {
  await page.goto("/b/curto-demais");
  await expect(page.getByRole("heading", { name: "Este link não vale mais." })).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveCount(0);
  await expect(page).toHaveTitle(/Boarding Check/);
  expect((await axe(page)).violations).toEqual([]);
});

// Regra do dono (PLANO, "O stage é uma réplica exata da produção"): nenhuma dica do PIN nem texto de ambiente.
test("nenhum texto de ambiente nem dica do PIN", async ({ page }) => {
  await page.goto(LINK);
  await expect(page.getByLabel("Senha")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/ambiente de valida|fict[ií]ci|\bdemo|\bteste\b|2468|0000/i);
});
