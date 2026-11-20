import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-43: lista de Pacientes (PDD v206 §10, "Pacientes, lista", e §10.1), ainda sobre a porta simulada. A aba só entra
// na barra com a porta real e o seed (ORDEM do Tech Lead Frontend, regra 2), então a rota é aberta direto.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("lista de Pacientes", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("sem sessão, vai para a tela de entrar guardando a volta", async ({ browser }) => {
    const anonimo = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anonimo.newPage();
    await page.goto("/painel/pacientes");
    await expect(page).toHaveURL(/\/login\?volta=%2Fpainel%2Fpacientes$/);
    await anonimo.close();
  });

  test("as 5 colunas do PDD, passa no axe, sem texto de ambiente e sem a aba enquanto a porta for a simulada", async ({ page }) => {
    await page.goto("/painel/pacientes");
    const tabela = page.getByRole("table", { name: "Pacientes da clínica" });
    await expect(tabela).toBeVisible();
    await expect(tabela.getByRole("columnheader")).toHaveText(["Paciente", "Identificação", "Contato", "Último atendimento", "Documentos"]);
    await expect(page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link", { name: "Pacientes" })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("main").innerText()).not.toMatch(PROIBIDO);
  });

  test("busca por CPF pelo corpo da action, sem o CPF na URL", async ({ page }) => {
    await page.goto("/painel/pacientes");
    await page.getByRole("searchbox", { name: "Buscar paciente por nome ou CPF" }).fill("529.982.247-25");
    await expect(page.getByRole("row")).toHaveCount(2); // cabeçalho + Juliana Prates
    await expect(page.getByRole("row", { name: /Juliana Prates/ })).toBeVisible();
    expect(page.url()).not.toContain("529");
  });

  for (const largura of [1280, 390]) {
    test(`em ${largura} px a página não rola de lado (quem rola é a tabela)`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto("/painel/pacientes");
      await expect(page.getByRole("table")).toBeVisible();
      const rolaDeLado = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(rolaDeLado).toBe(false);
    });
  }
});
