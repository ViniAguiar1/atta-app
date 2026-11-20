import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SENHA, SESSAO_DA_GESTORA } from "./acesso";

// MIG-42: Configurações, exclusiva do ADMIN (PDD §10.4.3), com o menu lateral em grupos e Configurações › Agendamentos.
// Porta real (MIG-10b) contra o Supabase local com o seed: a aba está em MODULOS_PRONTOS e o valor salvo fica no banco.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test.describe("ADMIN", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("abre em Agendamentos, com o menu lateral e os cartões, sem violação do axe", async ({ page }) => {
    await page.goto("/painel/configuracoes");
    await expect(page).toHaveURL(/\/painel\/configuracoes\/agendamentos$/);
    const menu = page.getByRole("navigation", { name: "Seções de Configurações" });
    await expect(menu.getByRole("link", { name: "Agendamentos" })).toHaveAttribute("aria-current", "page");
    for (const cartao of ["Link Check-in Online", "Janela de confirmação", "Fluxo alternativo", "Ausência automática", "Envio das mensagens"])
      await expect(page.getByRole("region", { name: cartao })).toBeVisible();
    await expect(page.getByText("Validade total do link: 4 h")).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });

  test("a aba Configurações aparece para o ADMIN, e o valor salvo continua depois de recarregar", async ({ page }) => {
    await page.goto("/painel/configuracoes/agendamentos");
    await expect(page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link", { name: "Configurações" })).toHaveAttribute("aria-current", "page");
    const janela = page.getByLabel("Abrir a confirmação (horas antes)");
    const outro = (await janela.inputValue()) === "48" ? "72" : "48";
    await janela.fill(outro);
    await janela.press("Enter");
    await expect(page.getByText("Salvo.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Abrir a confirmação (horas antes)")).toHaveValue(outro);
  });

  test("regra cruzada do banco aparece no campo", async ({ page }) => {
    await page.goto("/painel/configuracoes/agendamentos");
    const lembrete2 = page.getByLabel("Segundo lembrete (min antes)");
    await lembrete2.fill("120"); // o 1º é 60: o 2º precisa vir depois dele
    await lembrete2.press("Enter");
    await expect(page.getByText(/O segundo lembrete precisa vir depois do primeiro/)).toBeVisible();
  });

  test("valor fora do limite é recusado no campo", async ({ page }) => {
    await page.goto("/painel/configuracoes/agendamentos");
    const janela = page.getByLabel("Abrir a confirmação (horas antes)");
    await janela.fill("900");
    await janela.press("Enter");
    await expect(page.getByText("Use um valor de 1 a 720.")).toBeVisible();
  });
});

test.describe("ADMIN, celulares do Fluxo alternativo", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("adiciona um celular, que volta mascarado, e remove", async ({ page }) => {
    await page.goto("/painel/configuracoes/agendamentos");
    const fluxo = page.getByRole("region", { name: "Fluxo alternativo" });
    await fluxo.getByRole("button", { name: "+ Adicionar celular" }).click();
    await fluxo.getByLabel(/^Nome do celular/).fill("Celular da recepção");
    await fluxo.getByLabel(/^Número do celular/).fill("(48) 99999-0001");
    await fluxo.getByRole("button", { name: "Salvar celular" }).click();
    await expect(fluxo.getByText("(48) ·····-0001")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain("99999-0001");
    expect((await axe(page)).violations).toEqual([]);
    await fluxo.getByRole("button", { name: "Remover Celular da recepção" }).last().click();
    await expect(fluxo.getByText("(48) ·····-0001")).toHaveCount(0);
  });
});

test("COLABORADOR não entra em Configurações", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/painel/configuracoes/agendamentos");
  await expect(page).toHaveURL(/\/painel$/);
});
