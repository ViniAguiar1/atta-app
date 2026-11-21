import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";
import { BOARDING_LOCAL_PIN, BOARDING_LOCAL_SEGREDO } from "../tests/fixtures/boarding-local";

// Boarding Check do profissional (MIG-23 parte 3b e MIG-53; PDD §10.2.3, RN-FIC-07; ADR 0004 §3) com a porta real e o
// banco, no tamanho de celular, contra o Supabase local do CI. O link e o PIN são os FICTÍCIOS do supabase/seed.sql
// (tests/fixtures/boarding-local.ts): só valem no local e no CI. O PIN certo consome o link (um fluxo por `db reset`),
// então o spec roda em série e não repete. Atendimento: consulta de amanhã, 10:00, da Carla Siqueira, Pronto.
// Largura de 360 px (o menor celular comum; regra do Tech Lead Frontend para o axe).
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });
test.describe.configure({ mode: "serial", retries: 0 });

const LINK = `/b/${BOARDING_LOCAL_SEGREDO}`;
const PIN_ERRADO = "1111";
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

const digitarPin = async (page: Page, pin: string) => {
  await page.getByLabel("Senha").fill(pin);
  await page.getByRole("button", { name: "Ver atendimento" }).click();
};

test("o GET do link não renderiza nem guarda o segredo na URL, e tem os headers da trava", async ({ request }) => {
  const r = await request.get(LINK, { maxRedirects: 0 });
  expect(r.status()).toBe(303);
  expect(r.headers()["location"]).toBe("/boarding");
  expect(r.headers()["referrer-policy"]).toBe("no-referrer");
  expect(r.headers()["cache-control"]).toContain("no-store");
  expect(r.headers()["x-robots-tag"]).toContain("noindex"); // a lista ROTAS_COM_SEGREDO (src/lib/seguranca/cabecalhos.ts)
  expect(r.headers()["set-cookie"]).toMatch(/atta_boarding_link=.*HttpOnly/i);
  expect(r.headers()["set-cookie"]).toMatch(/Path=\/boarding/i);
});

// Regra do dono (PLANO, "O stage é uma réplica exata da produção"): nenhuma dica do PIN nem texto de ambiente.
test("nenhum texto de ambiente nem dica do PIN", async ({ page }) => {
  await page.goto(LINK);
  await expect(page.getByLabel("Senha")).toBeVisible();
  const texto = await page.locator("body").innerText();
  expect(texto).not.toMatch(/ambiente de valida|fict[ií]ci|\bdemo|\bteste\b/i);
  expect(texto).not.toContain(BOARDING_LOCAL_PIN);
});

test("sem link válido, a tela só diz que o link não vale mais", async ({ page }) => {
  await page.goto("/b/curto-demais");
  await expect(page.getByRole("heading", { name: "Este link não vale mais." })).toBeVisible();
  await expect(page.getByLabel("Senha")).toHaveCount(0);
  await expect(page).toHaveTitle(/Boarding Check/);
  expect((await axe(page)).violations).toEqual([]);
});

test("pré-visualização não gasta o link; PIN errado conta, o certo abre o atendimento do banco e consome o link", async ({ page, browser }) => {
  await page.request.get(LINK); // o WhatsApp abre o link antes do profissional
  await page.goto(LINK);
  await page.goto(LINK);
  expect(page.url()).toMatch(/\/boarding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Boarding Check" })).toBeVisible();
  await expect(page).toHaveTitle(/Boarding Check/); // o <title> chega por streaming; o axe roda depois dele
  expect((await axe(page)).violations).toEqual([]);

  // PIN errado: o banco conta (1 de 5 seguidas) e a tela pede de novo
  await digitarPin(page, PIN_ERRADO);
  await expect(page.locator("#pin-erro")).toHaveText(/Senha não confere/);
  await expect(page).toHaveTitle(/Boarding Check/); // a action mexe em cookie e o Next renderiza de novo
  expect((await axe(page)).violations).toEqual([]);

  // PIN certo: o resumo vem do banco (api.boarding_open), e o atendimento passa a Em atendimento
  await digitarPin(page, BOARDING_LOCAL_PIN);
  await expect(page.getByText("Carla Siqueira")).toBeVisible();
  await expect(page.getByText(/^\d+ anos$/)).toBeVisible();
  await expect(page.getByText("10:00", { exact: true })).toBeVisible();
  await expect(page.getByText("Consulta", { exact: true })).toBeVisible();
  await expect(page.getByText("1 atendimento · 0 ausências")).toBeVisible(); // a consulta Concluída do seed
  expect(page.url()).toMatch(/\/boarding$/);
  await expect(page).toHaveTitle(/Boarding Check/);
  expect((await axe(page)).violations).toEqual([]);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "atta_boarding_link")).toBeUndefined();
  const sessao = cookies.find((c) => c.name === "atta_grant");
  expect(sessao?.httpOnly).toBe(true);
  expect(sessao?.path).toBe("/boarding");

  // recarregar abre de novo (Em atendimento continua aberto para o profissional)
  await page.reload();
  await expect(page.getByText("Carla Siqueira")).toBeVisible();

  // o link já foi consumido: noutro aparelho, o PIN certo não abre mais nada
  const outro = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 } });
  const tela = await outro.newPage();
  await tela.goto(LINK);
  await digitarPin(tela, BOARDING_LOCAL_PIN);
  await expect(tela.getByRole("heading", { name: "Este link não vale mais." })).toBeVisible();
  await expect(tela.getByText("Carla Siqueira")).toHaveCount(0);
  await outro.close();
});
