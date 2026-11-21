import AxeBuilder from "@axe-core/playwright";
import { devices, expect, type Page, test } from "@playwright/test";
import { PROPASS_LOCAL_EMAIL, PROPASS_LOCAL_SEGREDO } from "../tests/fixtures/propass-convite-local";

// PROpass de ponta a ponta com a porta real e o banco (MIG-55; PDD §10.4.3), em 360 px, contra o Supabase local do CI.
// O convite é o FICTÍCIO do supabase/seed.sql (#264): segredo conhecido, que só vale no local e no CI (a prévia e a
// produção recusam a KEK de teste que cifra o e-mail). O link é de uso único: um envio completo por `db reset`, então
// este spec não repete (retries 0) e roda em série. Profissional e CPF são fictícios (CPF gerado, nome inventado).
test.use({ ...devices["iPhone 13"], viewport: { width: 360, height: 780 }, defaultBrowserType: "chromium" });
test.describe.configure({ mode: "serial", retries: 0 });

const CPF_FICTICIO = "13241241564";

const semViolacoes = async (page: Page) =>
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);

test("o profissional preenche, lê, assina, cria a senha e conclui; o link não abre de novo", async ({ page }) => {
  await page.goto(`/propass/${PROPASS_LOCAL_SEGREDO}`);
  expect(page.url()).toMatch(/\/propass$/); // o segredo sai da URL
  await expect(page.getByText("Clínica Alfa Estética convidou você", { exact: false })).toBeVisible();
  await expect(page.getByLabel("E-mail profissional")).toHaveValue(PROPASS_LOCAL_EMAIL); // travado; aberto só no servidor
  await semViolacoes(page);

  // passo 1: dados
  await page.getByLabel("Nome completo").fill("Bruna Reis Fictícia");
  await page.getByLabel("CPF").fill(CPF_FICTICIO);
  await page.getByLabel("WhatsApp de contato").fill("11987654321");
  await page.getByLabel("Conselho").selectOption("crm");
  await page.getByLabel("Número de registro").fill("990001");
  await page.getByLabel("UF").selectOption("SP");
  await page.getByRole("button", { name: "Continuar" }).click();

  // passo 2: conselho (sem consulta real, R20) e identidade: CPF novo, então pede a senha
  await expect(page.getByText(/conferência do seu registro no conselho é feita pela equipe ATTA/)).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // passo 3: o termo vem do servidor, preenchido com os dados; só assina depois de ler até o fim
  const termo = page.getByRole("region", { name: "Texto do Termo de Autorização" });
  await expect(termo).toContainText("Bruna Reis Fictícia");
  await expect(page.getByRole("button", { name: "Leia o termo até o fim para assinar" })).toBeDisabled();
  await termo.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  const quadro = page.locator("canvas");
  await quadro.scrollIntoViewIfNeeded();
  const caixa = (await quadro.boundingBox())!;
  await page.mouse.move(caixa.x + 20, caixa.y + 20);
  await page.mouse.down();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 8 });
  await page.mouse.move(caixa.x + caixa.width - 20, caixa.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Assinar o termo" }).click();

  // passo 4: senha de 4 números e envio
  await expect(page.getByRole("heading", { name: "Crie sua senha de 4 números" })).toBeVisible();
  await page.getByLabel("Senha", { exact: true }).fill("2468");
  await page.getByLabel("Confirme a senha").fill("2468");
  await page.getByRole("button", { name: "Concluir o PROpass" }).click();
  await expect(page.getByRole("heading", { name: "PROpass concluído" })).toBeVisible({ timeout: 15_000 });
  await semViolacoes(page);
  expect(await page.locator("body").innerText()).not.toContain(CPF_FICTICIO);

  // uso único: o mesmo link não abre o formulário de novo
  await page.goto(`/propass/${PROPASS_LOCAL_SEGREDO}`);
  await expect(page.getByRole("heading", { name: "Este convite não vale mais." })).toBeVisible();
  await expect(page.getByLabel("CPF")).toHaveCount(0);
});
