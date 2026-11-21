import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-44: Termos & Docs › Modelos de documento (PDD v206 §10.3.1; simulador, captura 39) na porta real, contra o
// Supabase local com o seed fictício, que não tem modelo: a tela mostra o estado vazio, sem dado de mentira, e os
// cartões sem fonte mostram "—" (URGENTE do Tech Lead Frontend).
const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|exemplos?:/i;

test("sem sessão, vai para a tela de entrar guardando a volta", async ({ page }) => {
  await page.goto("/painel/documentos");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel%2Fdocumentos$/);
});

test.describe("gestora da Clínica Alfa", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  for (const largura of [1440, 390]) {
    test(`em ${largura} px: subaba, cartões, estado vazio e axe sem violação`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/painel/documentos");
      await expect(page.getByText("Modelos de documento", { exact: true })).toBeVisible();
      const cards = page.getByRole("region", { name: "Resumo dos modelos" });
      await expect(cards).toContainText("Termos ativos");
      await expect(cards).toContainText("— vencido(s) para reassinar");
      await expect(page.getByText("Nenhum modelo de documento ainda")).toBeVisible();
      expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
