import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// MIG-40: a casca do painel (Simulador ATTA-in e Guia de Design §4.1) no build de produção, no painel e no celular.
const modulos = (page: import("@playwright/test").Page) => page.getByRole("navigation", { name: "Módulos do painel" });

const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

const TAMANHOS = [
  ["painel 1512", { width: 1512, height: 800 }],
  ["painel 1280", { width: 1280, height: 800 }],
  ["tablet 1024", { width: 1024, height: 768 }],
  ["celular", { width: 390, height: 844 }],
] as const;

for (const [nome, viewport] of TAMANHOS) {
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
      expect((await axe(page)).violations).toEqual([]);
      expect(deFora).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test("clínica, sino e pessoa na mesma linha, mesmo com nome longo", async ({ page }) => {
      await page.goto("/painel/agenda");
      const barra = page.getByRole("banner");
      await barra.locator("span.font-title").evaluate((el) => (el.textContent = "Clínica Fictícia de Estética Avançada Integrada"));
      const topo = async (l: import("@playwright/test").Locator) => Math.round((await l.boundingBox())?.y ?? -1);
      expect(await topo(barra.getByRole("link", { name: /Notificações/ }))).toBe(await topo(barra.getByRole("button", { name: /Deixar a barra/ })));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    // Fora do celular, nenhuma aba fica cortada: a nav não rola (QA no #5: "Configurações" cortada em 1512).
    if (viewport.width >= 1024) {
      test("todas as abas inteiras, sem rolagem na nav", async ({ page }) => {
        await page.goto("/painel/agenda");
        const sobra = await modulos(page).evaluate((nav) => nav.scrollWidth - nav.clientWidth);
        expect(sobra).toBeLessThanOrEqual(0);
        await expect(modulos(page).getByRole("link", { name: "Configurações" })).toBeInViewport({ ratio: 1 });
      });
    }
  });
}

// QA no #5: na barra escura o anel de foco tinha a cor do fundo (1:1). Tab 3 vezes leva a Pacientes.
test("foco visível nas duas barras: anel claro na escura e escuro na clara", async ({ page }) => {
  await page.goto("/painel/agenda");
  const pacientes = modulos(page).getByRole("link", { name: "Pacientes" });
  const cores = () =>
    pacientes.evaluate((el) => ({
      anel: getComputedStyle(el).outlineColor,
      estilo: getComputedStyle(el).outlineStyle,
      fundo: getComputedStyle(el.closest("header") as HTMLElement).backgroundColor,
    }));
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  await expect(pacientes).toBeFocused();
  const escura = await cores();
  expect(escura.estilo).toBe("solid");
  expect(escura.anel).toBe("rgb(255, 255, 255)");
  expect(escura.anel).not.toBe(escura.fundo);

  await page.getByRole("button", { name: "Deixar a barra clara" }).click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(pacientes).toBeFocused();
  const clara = await cores();
  expect(clara.anel).toBe("rgb(68, 74, 61)");
  expect(clara.anel).not.toBe(clara.fundo);
  expect((await axe(page)).violations).toEqual([]); // a barra clara também passa no axe
});

test("a aba ATTA usa a fonte de marca", async ({ page }) => {
  await page.goto("/painel/agenda");
  const fonte = await modulos(page).getByRole("link", { name: "ATTA" }).evaluate((el) => getComputedStyle(el).fontFamily);
  expect(fonte).toMatch(/Allerta/i);
});

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
