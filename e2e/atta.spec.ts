import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-48: Módulo ATTA (PDD v206 §10.6) com a sessão real da gestora do seed (ADMIN). As 5 subabas do simulador
// aparecem; Privacidade mostra a clínica da sessão e os números reais dela (nada inventado: sem API, "—").
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

test.use({ storageState: SESSAO_DA_GESTORA });

test("o ATTA abre a Central de Ajuda, com as 5 subabas do simulador", async ({ page }) => {
  await page.goto("/painel/atta");
  await expect(page).toHaveURL(/\/painel\/atta\/ajuda$/);
  const subabas = page.getByRole("navigation", { name: "Seções do ATTA" }).getByRole("link");
  await expect(subabas).toHaveText(["Central de Ajuda", "Suporte & Chamados", "Privacidade & Dados (LGPD)", "Co-criação", "Soluções ATTA"]);
  await expect(subabas.first()).toHaveAttribute("aria-current", "page");
  // Central de Ajuda (§10.6.1): os 7 guias do PDD e o FAQ, que abre pelo teclado
  await expect(page.getByRole("region", { name: "Guias por módulo" }).getByRole("heading", { level: 3 })).toHaveCount(7);
  await page.locator("summary", { hasText: "A recepção pode ver as respostas do Formulário de Saúde?" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Não, em nenhuma tela\. Nem o ADMIN acessa o conteúdo/)).toBeVisible();
  // planilha modelo de pacientes (§10.1), pela porta da importação (simulada fora da produção)
  await expect(page.getByRole("link", { name: "Baixar planilha modelo (.xlsx)" })).toHaveAttribute("href", /planilha-de-pacientes\.xlsx/);
  expect((await axe(page)).violations).toEqual([]);
});

test("Privacidade & Dados mostra a clínica da sessão e os números reais dela", async ({ page }) => {
  await page.goto("/painel/atta/privacidade");
  await expect(page.getByRole("note")).toContainText("a clínica (Clínica Alfa Estética) é controladora");
  const transparencia = page.getByRole("region", { name: "Transparência de dados armazenados" });
  // ADMIN: membros, procedimentos e modelos vêm do banco (números, não "—")
  await expect(transparencia).toContainText(/\d+ membros? · \d+ procedimentos? · \d+ modelos?/);
  await expect(transparencia).toContainText(/\d+ pacientes? · — documentos assinados/);
  await expect(page.getByRole("table", { name: "Prazos de guarda legal" })).toContainText("é obrigação da clínica");
  expect((await axe(page)).violations).toEqual([]);
});

test("Soluções ATTA mostra o ATTA me, sem botão sem destino", async ({ page }) => {
  await page.goto("/painel/atta/solucoes");
  const proximo = page.getByRole("region", { name: "Próximo produto" });
  await expect(proximo).toContainText("ATTA me");
  await expect(proximo.getByRole("button")).toHaveCount(0);
  expect((await axe(page)).violations).toEqual([]);
});
