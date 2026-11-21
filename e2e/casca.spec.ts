import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { INICIO_DO_PAINEL, SENHA, SESSAO_DA_GESTORA } from "./acesso";

// MIG-40 e MIG-03, regra do stage (PLANO e ADR 0001 §4): sem sessão, o painel leva à tela de entrar guardando a volta;
// com sessão (a gestora do seed, ADMIN com 2º fator), a barra mostra a clínica e a pessoa da sessão real.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("sem sessão", () => {
  test("/ vai para a tela de entrar", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
  });

  for (const caminho of ["/painel", "/painel/agenda", "/painel/configuracoes"]) {
    test(`${caminho} vai para a tela de entrar, guardando a volta`, async ({ page }) => {
      await page.goto(caminho);
      await expect(page).toHaveURL(new RegExp(`/login\\?volta=${encodeURIComponent(caminho)}$`));
      await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
    });
  }
});

test.describe("com sessão", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a barra mostra a clínica e a pessoa da sessão, passa no axe e não tem texto de ambiente", async ({ page }) => {
    await page.goto("/painel");
    await expect(page).toHaveURL(INICIO_DO_PAINEL); // o /painel leva à primeira aba do papel; espera a tela final
    const barra = page.getByRole("banner");
    await expect(barra).toContainText("Clínica Alfa Estética");
    await expect(barra).toContainText("HP"); // Helena Prado, pelas iniciais
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
  });

  test("as 6 abas do simulador aparecem para o ADMIN, e os módulos abrem sem 404", async ({ page }) => {
    await page.goto("/painel/metricas");
    const abas = page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link");
    await expect(abas).toHaveText(["Agendamentos", "Pacientes", "Termos & Docs", "ATTA", "Métricas", "Configurações"]);
    await expect(page.getByRole("link", { name: /^Notificações/ })).toBeVisible();
    // Termos & Docs não fica vazio: toda clínica tem o Termo de Autorização de sistema (MIG-21c, decisão do CTO P2c)
    await page.goto("/painel/documentos");
    await expect(page.getByRole("main").getByRole("region", { name: "Modelos de documento" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link", { name: "Termos & Docs" })).toHaveAttribute("aria-current", "page");
    expect((await axe(page)).violations, "/painel/documentos").toEqual([]);
  });

  test("/ e /login com sessão vão ao painel", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(INICIO_DO_PAINEL);
    await page.goto("/login");
    await expect(page).toHaveURL(INICIO_DO_PAINEL);
  });

  test("o cookie da sessão é HttpOnly e SameSite=Lax", async ({ page }) => {
    await page.goto("/painel");
    const sessao = (await page.context().cookies()).filter((c) => (c.name.startsWith("sb-") && c.name.includes("auth-token")) || c.name === "atta_atividade");
    expect(sessao.length).toBeGreaterThan(0);
    for (const c of sessao) {
      expect(c.httpOnly).toBe(true);
      expect(c.sameSite).toBe("Lax");
    }
  });
});

// Menu da pessoa (PDD §10: "o menu da pessoa logada (perfil e sair)"; simulador: "Sair / trocar usuário"). Entra do zero
// com a colaboradora (sem 2º fator), para o Sair não derrubar a sessão salva da gestora que os outros testes usam.
test("o menu da pessoa tem Sair / trocar usuário, que encerra a sessão e volta à tela de entrar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);
  const menu = page.getByRole("banner").getByRole("button", { name: /^Menu d/ });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  expect((await axe(page)).violations).toEqual([]);
  // na barra escura, o anel do item do painel (fundo branco) é o focus-ring, não o branco da barra (2.4.7)
  const sair = page.getByRole("button", { name: "Sair / trocar usuário" });
  await page.keyboard.press("Tab");
  await expect(sair).toBeFocused();
  expect(await sair.evaluate((el) => getComputedStyle(el).outlineColor)).toBe("rgb(44, 49, 40)");
  await sair.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel$/);
});

test("rota fora do painel continua na página de não encontrada, sem indexar", async ({ page }) => {
  await page.goto("/inexistente");
  await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
});

// S2 da QA no stage (21/11): o acesso do Colaborador é módulo a módulo (PDD §10.4.3). A colaboradora do seed tem o padrão
// do convite (Agendamentos e Pacientes completos, ATTA ver; Termos & Docs nenhum).
test("a colaboradora com o padrão do convite não vê Termos & Docs, e a rota mostra o \"sem acesso\"", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);
  const abas = page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link");
  await expect(abas).toHaveText(["Agendamentos", "Pacientes", "ATTA"]);
  await page.goto("/painel/documentos");
  await expect(page.getByRole("main").getByText("Você não tem acesso a este módulo")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("SEM_PERMISSAO");
  expect((await axe(page)).violations).toEqual([]);
});

// O mesmo S2 com a colaboradora sem Agendamentos (a COLAB2 da QA; no seed, semagenda.ficticia): o login cai na primeira
// aba liberada (Pacientes), e a Agenda pela URL mostra o "sem acesso", sem "Não foi possível carregar".
test("a colaboradora sem Agendamentos entra em Pacientes, e a Agenda mostra o \"sem acesso\"", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("semagenda.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel\/pacientes$/);
  await expect(page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link")).toHaveText(["Pacientes", "ATTA"]);
  await page.goto("/painel/agenda");
  await expect(page.getByRole("main").getByText("Você não tem acesso a este módulo")).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Não foi possível carregar");
  expect((await axe(page)).violations).toEqual([]);
});

