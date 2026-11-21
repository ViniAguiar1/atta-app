import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-45 (PDD v206 §21 e §10.4.6; simulador, captura 41): o sino abre a Caixa de notificações. No CI a porta é a simulada
// (só dado fictício, sem dado de saúde); na produção, a vazia (teste de unidade da porta). Sem texto de ambiente.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]|RN-NOT/i;

test.describe("sino da gestora", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("o sino abre a caixa: grupos, não lidas, busca e como as notificações chegam", async ({ page }) => {
    await page.goto("/painel/agenda");
    await page.getByRole("link", { name: /^Notificações/ }).click();
    await expect(page).toHaveURL(/\/painel\/notificacoes$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("navigation", { name: "Seções de Notificações" }).getByRole("link", { name: "Caixa de notificações" })).toHaveAttribute("aria-current", "page");
    await expect(main.getByRole("region", { name: /^Hoje/ })).toBeVisible();
    await expect(main.getByText("Não lida").first()).toBeVisible();
    await expect(main.getByRole("complementary", { name: "Como as notificações chegam" })).toContainText("Sempre ativo");
    await main.getByRole("searchbox", { name: "Buscar notificações" }).fill("convite");
    // só a lista da caixa: a coluna dos canais e as subabas também têm itens de lista
    await expect(main.getByRole("region", { name: /^Hoje/ }).getByRole("listitem")).toHaveCount(1);
    await expect(main.getByRole("region", { name: /^Ontem/ })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
    expect((await axe(page)).violations).toEqual([]);
  });
});
