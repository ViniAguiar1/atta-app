import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SENHA, SESSAO_DA_GESTORA } from "./acesso";

// MIG-42: Configurações, exclusiva do ADMIN (PDD §10.4.3), com o menu lateral em grupos e Configurações › Agendamentos.
// Porta simulada até o MIG-10b: a aba continua fora de MODULOS_PRONTOS (regra do Tech Lead Frontend).
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test.describe("ADMIN", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("abre em Agendamentos, com o menu lateral e os cartões, sem violação do axe", async ({ page }) => {
    await page.goto("/painel/configuracoes");
    await expect(page).toHaveURL(/\/painel\/configuracoes\/agendamentos$/);
    const menu = page.getByRole("navigation", { name: "Seções de Configurações" });
    await expect(menu.getByRole("link", { name: "Agendamentos" })).toHaveAttribute("aria-current", "page");
    for (const cartao of ["Link Check-in Online", "Janela de confirmação", "Ausência automática"])
      await expect(page.getByRole("region", { name: cartao })).toBeVisible();
    await expect(page.getByText("Validade total do link: 4 h")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("valor fora do limite é recusado no campo", async ({ page }) => {
    await page.goto("/painel/configuracoes/agendamentos");
    const janela = page.getByLabel("Abrir a confirmação (horas antes)");
    await janela.fill("900");
    await janela.press("Enter");
    await expect(page.getByText("Use um valor de 1 a 720.")).toBeVisible();
  });
});

test("COLABORADOR não entra em Configurações", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/painel/configuracoes/agendamentos");
  await expect(page).toHaveURL(/\/painel$/);
});
