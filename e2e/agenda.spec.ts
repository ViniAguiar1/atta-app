import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-41, visão Hoje da Agenda (PDD v206 §10.2.2), ainda na porta simulada: a rota abre com sessão, passa no axe,
// não rola de lado e a busca não leva nome nem CPF à URL. A aba fica escondida até a porta real (ORDEM do TL Frontend).
const axe = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("Agenda › Hoje", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("mostra a tabela do dia, passa no axe e não tem texto de ambiente", async ({ page }) => {
    await page.goto("/painel/agenda");
    const tabela = page.getByRole("region", { name: "Agendamentos de hoje" });
    await expect(tabela.getByRole("columnheader", { name: /Horário/ })).toHaveAttribute("aria-sort", "ascending");
    await expect(tabela.getByRole("row", { name: /Juliana Prates/ })).toContainText("Em atendimento");
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("main").innerText()).not.toMatch(PROIBIDO);
  });

  test("a aba Agendamentos ainda não aparece na barra", async ({ page }) => {
    await page.goto("/painel/agenda");
    await expect(page.getByRole("banner").getByRole("link", { name: /Agendamentos/ })).toHaveCount(0);
  });

  test("a busca filtra sem levar o termo à URL", async ({ page }) => {
    await page.goto("/painel/agenda");
    await page.getByRole("searchbox", { name: "Buscar por nome ou CPF" }).fill("Juliana");
    const tabela = page.getByRole("region", { name: "Agendamentos de hoje" });
    await expect(tabela.getByRole("row")).toHaveCount(2); // cabeçalho + Juliana
    expect(page.url()).not.toMatch(/Juliana/i);
    await page.getByRole("searchbox", { name: "Buscar por nome ou CPF" }).fill("431.572.801-20");
    await expect(tabela.getByRole("row", { name: /Juliana Prates/ })).toBeVisible();
    expect(page.url()).not.toMatch(/431|572|801/);
  });

  for (const largura of [1280, 390]) {
    test(`não rola de lado em ${largura} px`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/painel/agenda");
      await expect(page.getByRole("region", { name: "Agendamentos de hoje" })).toBeVisible();
      const rola = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(rola).toBe(false);
    });
  }
});
