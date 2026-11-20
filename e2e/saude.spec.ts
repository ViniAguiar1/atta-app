import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("a página de saúde responde ok", async ({ request }) => {
  const resposta = await request.get("/api/health");
  expect(resposta.ok()).toBe(true);
  expect(await resposta.json()).toMatchObject({ status: "ok", service: "atta-app" });
});

test("a página inicial (a tela de entrar) passa no axe e não pede nada a outra origem", async ({ page, baseURL }) => {
  const origem = new URL(baseURL ?? "http://127.0.0.1:3000").origin;
  const deFora: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(origem) && !r.url().startsWith("data:")) deFora.push(r.url());
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/); // regra do stage: "/" sem sessão é a tela de entrar
  await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
  const resultado = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(resultado.violations).toEqual([]);
  expect(deFora, "fontes e scripts auto-hospedados (ADR 0001 §6)").toEqual([]);
});
