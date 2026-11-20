import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SENHA, SESSAO_DA_GESTORA } from "./acesso";

// MIG-40 e MIG-03, regra do stage (PLANO e ADR 0001 §4): sem sessão, o painel leva à tela de entrar guardando a volta;
// com sessão (a gestora do seed, ADMIN com 2º fator), a barra mostra a clínica e a pessoa da sessão real.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("sem sessão", () => {
  test("/ vai para a tela de entrar", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
  });

  for (const caminho of ["/painel", "/painel/agenda", "/painel/configuracoes"]) {
    test(`${caminho} vai para a tela de entrar, guardando a volta`, async ({ page }) => {
      await page.goto(caminho);
      await expect(page).toHaveURL(new RegExp(`/login\\?volta=${encodeURIComponent(caminho)}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
    });
  }
});

test.describe("com sessão", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a barra mostra a clínica e a pessoa da sessão, passa no axe e não tem texto de ambiente", async ({ page }) => {
    await page.goto("/painel");
    const barra = page.getByRole("banner");
    await expect(barra).toContainText("Clínica Alfa Estética");
    await expect(barra).toContainText("HP"); // Helena Prado, pelas iniciais
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
  });

  test("/ e /login com sessão vão ao painel", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/painel$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/painel$/);
  });

  test("o cookie da sessão é HttpOnly e SameSite=Lax", async ({ page }) => {
    await page.goto("/painel");
    const sessao = (await page.context().cookies()).filter((c) => (c.name.startsWith("sb-") && c.name.includes("auth-token")) || c.name === "atta_atividade");
    expect(sessao.length).toBeGreaterThan(0);
    for (const c of sessao) {
      expect(c.httpOnly).toBe(true);
      expect(c.sameSite).toBe("Lax");
    }
  });
});

// Menu da pessoa (PDD §10: "o menu da pessoa logada (perfil e sair)"; simulador: "Sair / trocar usuário"). Entra do zero
// com a colaboradora (sem 2º fator), para o Sair não derrubar a sessão salva da gestora que os outros testes usam.
test("o menu da pessoa tem Sair / trocar usuário, que encerra a sessão e volta à tela de entrar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  const menu = page.getByRole("banner").getByRole("button", { name: /^Menu d/ });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole("button", { name: "Sair / trocar usuário" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel$/);
});

test("rota fora do painel continua na página de não encontrada, sem indexar", async ({ page }) => {
  await page.goto("/inexistente");
  await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
