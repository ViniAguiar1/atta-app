import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";

// PROpass do profissional (MIG-55; PDD §10.4.3) com a porta simulada, em 360 px, e axe a cada passo. CPF gerado e
// nomes fictícios; valores de teste no migracao/guia-de-teste.md, nunca na tela.
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });

const LINK = `/propass/${"conv".padEnd(43, "A")}`;
// prints de 390 px para o PR, só quando pedidos (PRINTS_PROPASS=pasta); no CI não grava nada
const print = async (page: Page, nome: string) => {
  if (process.env.PRINTS_PROPASS) await page.screenshot({ path: `${process.env.PRINTS_PROPASS}/propass-${nome}-390.png`, fullPage: true });
};
const axe = async (page: Page) => {
  await expect(page).toHaveTitle(/PROpass/); // o <title> chega por streaming; o axe roda depois dele
  return (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations;
};

test("do convite ao conselho regularizado, sem dado pessoal na URL", async ({ page }) => {
  await page.request.get(LINK); // a pré-visualização do e-mail não gasta o link
  await page.goto(LINK);
  expect(page.url()).toMatch(/\/propass$/);
  await expect(page.getByRole("heading", { level: 1, name: "Confirme quem é você" })).toBeVisible();
  await expect(page.getByLabel("E-mail profissional")).toHaveAttribute("readonly", "");
  expect(await axe(page)).toEqual([]);
  await print(page, "1-dados");

  await page.getByLabel("Nome completo").fill("Bruna Reis");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByLabel("WhatsApp de contato").fill("11987654321");
  await page.getByLabel("Conselho").selectOption("crm");
  await page.getByLabel("Número de registro").fill("201577");
  await page.getByLabel("UF").selectOption("SP");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Camada 1 — Validação ATTA (Conselho)" })).toBeVisible();
  await expect(page.getByText("Regularizado (Conselho Ativo)")).toBeVisible();
  expect(page.url()).not.toMatch(/52998224725|11987654321/);
  expect(await axe(page)).toEqual([]);
  await print(page, "2-conselho");

  // passo 3: o termo vem do servidor; o quadro só abre depois de rolar até o fim
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Termo de Autorização de Uso de Imagem de Assinatura Digital" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Leia o termo até o fim para assinar" })).toBeDisabled();
  expect(await axe(page)).toEqual([]);
  await print(page, "3-termo");
  await page.getByRole("region", { name: "Texto do Termo de Autorização" }).evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event("scroll"));
  });
  const quadro = page.getByRole("img", { name: "Desenhe sua assinatura com o mouse ou o dedo" });
  await quadro.scrollIntoViewIfNeeded();
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 20, caixa.y + 60);
  await page.mouse.down();
  await page.mouse.move(caixa.x + 120, caixa.y + 40, { steps: 8 });
  await page.mouse.move(caixa.x + 200, caixa.y + 80, { steps: 8 });
  await page.mouse.up();
  await print(page, "3-termo-assinado");
  await page.getByRole("button", { name: "Assinar o termo" }).click();

  // senha de 4 números, recusando a óbvia
  await expect(page.getByRole("heading", { level: 1, name: "Crie sua senha de 4 números" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.getByLabel("Senha", { exact: true }).fill("1234");
  await page.getByLabel("Confirme a senha").fill("1234");
  await page.getByRole("button", { name: "Concluir o PROpass" }).click();
  await expect(page.getByText(/menos óbvia/)).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("2468");
  await page.getByLabel("Confirme a senha").fill("2468");
  await print(page, "3-senha");
  await page.getByRole("button", { name: "Concluir o PROpass" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "PROpass concluído" })).toBeVisible();
  await expect(page.getByText(/só agenda seus atendimentos depois dessa conferência/)).toBeVisible();
  expect(page.url()).not.toMatch(/2468|52998224725/);
  expect(await axe(page)).toEqual([]);
  await print(page, "4-concluido");
});

test("clínica sem o Termo de Autorização publicado: aviso, sem quadro de assinatura", async ({ page }) => {
  await page.goto(LINK);
  await page.getByLabel("Nome completo").fill("Bruna Reis");
  await page.getByLabel("CPF").fill("52998224725");
  await page.getByLabel("WhatsApp de contato").fill("11987654321");
  await page.getByLabel("Conselho").selectOption("crm");
  await page.getByLabel("Número de registro").fill("777777");
  await page.getByLabel("UF").selectOption("SP");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /ainda não publicou o Termo/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Desenhe sua assinatura/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test("convite inválido mostra só o aviso, sem formulário", async ({ page }) => {
  await page.goto("/propass/curto-demais");
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test("nenhum texto de ambiente nem dica de teste na tela", async ({ page }) => {
  await page.goto(LINK);
  await expect(page.getByLabel("CPF")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/ambiente de valida|fict[ií]ci|\bdemo|\bteste\b|exemplo válido/i);
});
