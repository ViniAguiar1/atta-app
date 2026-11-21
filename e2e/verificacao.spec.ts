import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// MIG-54: verificação pública do Código ATTA (PDD v206 §18.6; simulador, capturas 53 e 55), sem login, contra o
// verificarCodigo do #114 e o Supabase local. O seed não tem documento assinado: aqui entram a entrada e o código
// inexistente; o resultado válido está no teste de componente.
const axe = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|c[óo]digos existentes/i;

for (const largura of [1440, 390]) {
  test(`em ${largura} px: entrada, código inexistente, sem texto de demonstração e axe sem violação`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.goto("/verificar");
    await expect(page.getByRole("heading", { level: 1, name: "Qualquer pessoa confere um documento pelo código" })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);

    await page.getByLabel("Código ATTA").fill("ATTA-0000-0000-0000");
    await page.getByRole("button", { name: "Verificar" }).click();
    await expect(page).toHaveURL(/\/verificar\/ATTA-0000-0000-0000$/);
    await expect(page.getByRole("status")).toContainText("Código não encontrado.");
    await expect(page).toHaveTitle(/Verificação pública/);
    expect(await axe(page)).toEqual([]);
  });
}
