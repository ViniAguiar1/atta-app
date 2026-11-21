import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-46 (PDD v206 §10.5; simulador, captura 40): o Painel de Métricas da gestora (ADMIN). No CI a porta é a simulada
// (só número fictício e agregado); na produção, a vazia mostra "—" (teste de unidade da porta). Sem texto de ambiente.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("Métricas da gestora", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("Painel com a faixa, os 4 cards, a preparação e os tempos de hoje; subabas Funil e Exportação no estado vazio", async ({ page }) => {
    await page.goto("/painel/metricas");
    await expect(page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link", { name: "Métricas" })).toHaveAttribute("aria-current", "page");
    const subabas = page.getByRole("navigation", { name: "Seções de Métricas" }).getByRole("link");
    await expect(subabas).toHaveText(["Painel", "Funil e tendências", "Exportação"]);
    await expect(subabas.first()).toHaveAttribute("aria-current", "page");

    const main = page.getByRole("main");
    await expect(main.getByRole("note")).toHaveText("Mede a eficiência do check-in, nunca o desempenho clínico.");
    const cards = main.getByRole("region", { name: "Indicadores do mês" });
    for (const rotulo of ["Tempo médio de check-in", "Tempo operacional salvo", "Atendimentos extras no mês", "Documentos assinados"]) {
      await expect(cards.getByText(rotulo)).toBeVisible();
    }
    await expect(cards).toContainText("3m 27s");
    await expect(main.getByRole("heading", { name: "Taxa de Preparação Prévia" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Tempos de hoje" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
    expect((await axe(page)).violations).toEqual([]);

    await subabas.nth(1).click();
    await expect(page).toHaveURL(/\/painel\/metricas\/funil$/);
    await expect(main.getByText("Ainda não há dados para o funil")).toBeVisible();
    await subabas.nth(2).click();
    await expect(page).toHaveURL(/\/painel\/metricas\/exportacao$/);
    await expect(main.getByText("Nada para exportar ainda")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });
});
