import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// MIG-34: Configurações › Importação de pacientes (captura 48; PDD §10.1), com a porta simulada da Integrações (fora da
// produção). Nada de planilha real: os arquivos são bytes vazios com nome de exemplo; a simulada trata menos de 1 KB como
// "fora do modelo" e, acima disso, devolve a prévia de uma planilha fictícia (CPFs gerados).
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]);
const xlsx = (nome: string, bytes: number) => ({ name: nome, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.alloc(bytes) });

test.describe("ADMIN", () => {
  test.use({ storageState: SESSAO_DA_GESTORA });

  test("a seção mostra a faixa, a cota e o preço da API (o do PDD); o fluxo recusa fora do modelo, mostra a prévia e confirma", async ({ page }) => {
    await page.goto("/painel/configuracoes/importacao");
    const menu = page.getByRole("navigation", { name: "Seções de Configurações" });
    await expect(menu.getByRole("link", { name: "Importação de pacientes" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("note")).toContainText("Quem importa.");
    await expect(page.getByText("R$ 39,90 · por importação depois dos 3 meses")).toBeVisible();
    await expect(page.getByText(/Demonstração/)).toHaveCount(0);
    expect((await axe(page).analyze()).violations).toEqual([]);

    await page.getByRole("button", { name: "Importar base de pacientes" }).click();
    const dialogo = page.getByRole("dialog", { name: "Importar base de pacientes" });
    const arquivo = dialogo.getByLabel("Escolher a planilha (.xlsx)");
    await expect(arquivo).toBeDisabled(); // o envio só libera depois da declaração (PDD §10.1)
    await dialogo.getByRole("checkbox").check();
    // pelo teclado: o Tab chega ao campo de arquivo e o anel de foco aparece no rótulo (WCAG 2.4.7)
    await dialogo.getByRole("checkbox").focus();
    await page.keyboard.press("Tab");
    await expect(arquivo).toBeFocused();
    expect(await arquivo.evaluate((el) => getComputedStyle(el.closest("label")!).outlineStyle)).not.toBe("none");
    await arquivo.setInputFiles(xlsx("pequena.xlsx", 100));
    await expect(dialogo.getByRole("alert")).toContainText("Baixe a planilha modelo de novo");

    await arquivo.setInputFiles(xlsx("pacientes.xlsx", 4096));
    await expect(dialogo.getByRole("heading", { name: "Prévia da importação" })).toBeVisible();
    await expect(dialogo).toContainText("O processamento leva até 3 dias úteis.");
    await expect(dialogo.getByText(/^Linha \d+: /).first()).toBeVisible(); // só número da linha e motivo
    expect((await axe(page).include("dialog").analyze()).violations).toEqual([]);
    await dialogo.getByRole("button", { name: /^Importar \d+ pacientes?$/ }).click();
    await expect(dialogo.getByRole("status")).toContainText("Importação recebida.");
    await dialogo.getByRole("button", { name: "Fechar", exact: true }).last().click();
    await expect(dialogo).toBeHidden();
  });
});
