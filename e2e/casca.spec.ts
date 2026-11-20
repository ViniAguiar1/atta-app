import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// MIG-40: a casca do painel (Simulador ATTA-in e Guia de Design §4.1) no build de produção, no painel e no celular.
const modulos = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Módulos do painel" });

for (const [nome, viewport] of [["painel", { width: 1280, height: 800 }], ["celular", { width: 390, height: 844 }]] as const) {
  test.describe(nome, () => {
    test.use({ viewport });

    test("abas do simulador, a ativa pela rota, axe sem violação e nada pedido a outra origem", async ({ page, baseURL }) => {
      const origem = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
      const deFora: string[] = [];
      page.on("request", (r) => {
        if (!r.url().startsWith(origem) && !r.url().startsWith("data:")) deFora.push(r.url());
      });
      await page.goto("/painel/configuracoes");
      await expect(modulos(page).getByRole("link")).toHaveText(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA", "Métricas", "Configurações"]);
      await expect(modulos(page).getByRole("link", { name: "Configurações" })).toHaveAttribute("aria-current", "page");
      const resultado = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(resultado.violations).toEqual([]);
      expect(deFora).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  });
}

test("/painel abre em Agendamentos, e o monograma alterna a barra pelo teclado", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/painel\/agenda$/);
  await page.getByRole("button", { name: "Deixar a barra clara" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Deixar a barra escura" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Deixar a barra clara" })).toHaveAttribute("aria-pressed", "false");
});

// Com streaming (cacheComponents), o status fica 200 quando o notFound() vem depois de a resposta começar; o que vale é a
// página de não encontrada com robots noindex (doc not-found.md do Next 16).
test("módulo fora da lista mostra a página de não encontrada, sem indexar", async ({ page }) => {
  await page.goto("/painel/inexistente");
  await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});
