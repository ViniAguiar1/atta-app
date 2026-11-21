import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-42 (PDD v206 §10.4.1; simulador, captura 42): Configurações › Perfil da Clínica da gestora. No CI a porta é a
// simulada (só dado fictício); na produção, a vazia (teste de unidade da porta). Sem texto de ambiente.
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|migra[çc]/i;

test.describe("Perfil da Clínica da gestora", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a seção abre pelo menu, com a faixa, os dados da empresa e o contato, e salva um campo", async ({ page }) => {
    await page.goto("/painel/configuracoes");
    await page.getByRole("link", { name: "Perfil da Clínica" }).first().click();
    await expect(page).toHaveURL(/\/painel\/configuracoes\/perfil$/);
    const main = page.getByRole("main");
    await expect(main.getByRole("note")).toContainText("Sem botão de salvar.");
    await expect(main.getByLabel("CNPJ")).toHaveValue("11.222.333/0001-81");
    await main.getByLabel("Inscrição estadual/municipal (opcional)").fill("123456");
    await main.getByLabel("Inscrição estadual/municipal (opcional)").press("Enter");
    await expect(main.getByText(/^Salvo às \d{2}:\d{2}\.$/)).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  });
});
