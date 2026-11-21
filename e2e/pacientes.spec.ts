import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { INICIO_DO_PAINEL, SENHA, SESSAO_DA_GESTORA } from "./acesso";

// MIG-43: lista de Pacientes (PDD v206 §10, "Pacientes, lista", e §10.1) na porta real, contra o Supabase local com o
// seed fictício (supabase/seed.sql: 5 pacientes da Clínica Alfa, 1 da Beta). Sem simulado: o contato abre pela KEK de
// teste e a busca por CPF vai pelo HMAC do pepper de teste, como na produção com as chaves da Vercel.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;
const DA_ALFA = ["Alana Duarte", "Carla Siqueira", "Eduardo Lima", "Fábio Moreira", "Juliana Prates"];

test("sem sessão, vai para a tela de entrar guardando a volta", async ({ page }) => {
  await page.goto("/painel/pacientes");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel%2Fpacientes$/);
});

test.describe("gestora da Clínica Alfa", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a aba Pacientes aparece e a lista traz só os pacientes da clínica, em ordem de nome", async ({ page }) => {
    await page.goto("/painel/pacientes"); // o /painel abre em Agendamentos (§10.2.2); as abas aparecem sempre
    const aba = page.getByRole("navigation", { name: "Módulos do painel" }).getByRole("link", { name: "Pacientes" });
    await expect(aba).toHaveAttribute("aria-current", "page");
    const tabela = page.getByRole("table", { name: "Pacientes da clínica" });
    await expect(tabela.getByRole("columnheader")).toHaveText(["Paciente", "Identificação", "Contato", "Último atendimento", "Documentos"]);
    // a célula traz também as iniciais do avatar (escondidas do leitor de tela, mas no texto): casa pelo nome
    await expect(tabela.getByRole("rowheader")).toHaveText(DA_ALFA.map((n) => new RegExp(n)));
    await expect(page.getByText("Otávio Ramos")).toHaveCount(0); // paciente só da Clínica Beta
  });

  test("o contato abre no servidor e chega mascarado, como o CPF (PDD §19.8); sem CPF é Incompleto", async ({ page }) => {
    await page.goto("/painel/pacientes");
    const juliana = page.getByRole("row", { name: /Juliana Prates/ });
    await expect(juliana).toContainText("···.···.247-25");
    await expect(juliana).toContainText("(11) ·····-4321");
    await expect(juliana).toContainText("ju···@exemplo.test");
    const html = await page.content();
    expect(html).not.toContain("98765-4321");
    expect(html).not.toContain("juliana.prates@");
    const fabio = page.getByRole("row", { name: /Fábio Moreira/ });
    await expect(fabio).toContainText("Incompleto");
    await expect(fabio).toContainText("Sem documento");
    expect(await page.content()).not.toContain("52998224725");
  });

  test("busca por nome e por CPF inteiro pelo corpo da action, sem o CPF na URL", async ({ page }) => {
    await page.goto("/painel/pacientes");
    const busca = page.getByRole("searchbox", { name: "Buscar paciente por nome ou CPF" });
    await busca.fill("edu");
    await expect(page.getByRole("rowheader")).toHaveText([/Eduardo Lima/]);
    await busca.fill("529.982.247-25");
    await expect(page.getByRole("rowheader")).toHaveText([/Juliana Prates/]);
    expect(page.url()).not.toContain("529");
    await busca.fill("473.821.690-22"); // CPF da paciente da Beta: aqui não aparece
    await expect(page.getByText("Nenhum resultado para os filtros aplicados")).toBeVisible();
    await page.getByRole("button", { name: "Limpar filtros" }).click();
    await expect(page.getByRole("rowheader")).toHaveCount(DA_ALFA.length);
  });

  for (const largura of [1280, 390]) {
    test(`em ${largura} px passa no axe, sem texto de ambiente e sem rolagem lateral da página`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto("/painel/pacientes");
      await expect(page.getByRole("table")).toBeVisible();
      expect((await axe(page)).violations).toEqual([]);
      expect(await page.locator("main").innerText()).not.toMatch(PROIBIDO);
      const rolaDeLado = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(rolaDeLado).toBe(false);
    });
  }
});

// Colaborador lê Pacientes pela matriz atual (has_permission: patients é dos dois papéis; PDD §10.4.3).
test("a colaboradora da Alfa vê a mesma lista", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);
  await page.goto("/painel/pacientes");
  await expect(page.getByRole("rowheader")).toHaveCount(DA_ALFA.length);
});
