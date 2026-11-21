import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-41, visão Hoje da Agenda (PDD v206 §10.2.2) na porta real: api.agenda_day e api.agenda_summary (MIG-11c) no
// Supabase local com o supabase/seed.sql do #141 (só dado fictício: nomes inventados e CPFs gerados). A busca nunca leva
// nome nem CPF à URL; a tela passa no axe e não rola de lado.
const axe = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;
const CPF_DO_SEED = "529.982.247-25"; // gerado (dígito verificador válido), ninguém real: Juliana Prates no seed

const tabela = (page: import("@playwright/test").Page) => page.getByRole("region", { name: "Agendamentos de hoje" });
const postDaAgenda = (r: import("@playwright/test").Request) => r.method() === "POST" && r.url().includes("/painel/agenda");

test.describe("Agenda › Hoje (porta real)", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a aba Agendamentos aparece na barra e fica ativa", async ({ page }) => {
    await page.goto("/painel/agenda");
    await expect(page.getByRole("banner").getByRole("link", { name: /Agendamentos/ })).toHaveAttribute("aria-current", "page");
  });

  test("a lista do dia vem do banco, com os estados e o selo Atrasado, passa no axe e sem texto de ambiente", async ({
    page,
  }) => {
    await page.goto("/painel/agenda");
    const t = tabela(page);
    await expect(t.getByRole("columnheader", { name: /Horário/ })).toHaveAttribute("aria-sort", "ascending");
    await expect(t.getByRole("row", { name: /Alana Duarte/ })).toContainText("Em atendimento");
    await expect(t.getByRole("row", { name: /Eduardo Lima/ })).toContainText("Pronto");
    await expect(t.getByRole("row", { name: /Beatriz Lima/ })).toContainText("Em preenchimento");
    await expect(t.getByRole("row", { name: /Fábio Moreira/ })).toContainText("Ausente");
    await expect(t.getByRole("row", { name: /Juliana Prates/ }).filter({ hasText: "Atrasado" })).toHaveCount(1);
    await expect(page.locator('[data-estado="erro"]')).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("main").innerText()).not.toMatch(PROIBIDO);
  });

  test("os cards vêm do banco e o segmento Pronto filtra a lista pelo servidor", async ({ page }) => {
    await page.goto("/painel/agenda");
    const pronto = page.getByRole("button", { name: /^Pronto: 1\. Filtrar a lista$/ });
    await expect(pronto).toBeVisible();
    const pedido = page.waitForRequest(postDaAgenda);
    await pronto.click();
    await pedido;
    await expect(pronto).toHaveAttribute("aria-pressed", "true");
    await expect(tabela(page).getByRole("row")).toHaveCount(2); // cabeçalho + Eduardo Lima
    await expect(tabela(page).getByRole("row", { name: /Eduardo Lima/ })).toBeVisible();
  });

  test("busca por nome e pelo CPF inteiro vai ao servidor sem levar o termo à URL", async ({ page }) => {
    await page.goto("/painel/agenda");
    const busca = page.getByRole("searchbox", { name: "Buscar por nome ou CPF" });

    const pedidoNome = page.waitForRequest(postDaAgenda);
    await busca.fill("Alana");
    await pedidoNome;
    await expect(tabela(page).getByRole("row")).toHaveCount(2); // cabeçalho + Alana
    expect(page.url()).not.toMatch(/Alana/i);

    const pedidoCpf = page.waitForRequest(postDaAgenda);
    await busca.fill(CPF_DO_SEED);
    await pedidoCpf;
    await expect(tabela(page).getByRole("row", { name: /Juliana Prates/ }).first()).toBeVisible();
    expect(page.url()).not.toMatch(/529|982|247/);
  });

  test("CPF pela metade não vai ao servidor e mostra a dica", async ({ page }) => {
    await page.goto("/painel/agenda");
    await expect(tabela(page)).toBeVisible();
    let posts = 0;
    page.on("request", (r) => {
      if (postDaAgenda(r)) posts++;
    });
    await page.getByRole("searchbox", { name: "Buscar por nome ou CPF" }).fill("529.982");
    await expect(page.getByText("Digite ao menos 2 letras do nome ou o CPF completo.")).toBeVisible();
    await page.waitForTimeout(800);
    expect(posts).toBe(0);
  });

  for (const largura of [1280, 390]) {
    test(`não rola de lado em ${largura} px e passa no axe`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/painel/agenda");
      await expect(tabela(page)).toBeVisible();
      await expect(page.locator('[data-estado="erro"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      expect((await axe(page)).violations).toEqual([]);
    });
  }
});
