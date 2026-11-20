import { expect, test } from "@playwright/test";
import { SENHA } from "./acesso";

// MIG-42: Configurações é exclusiva do ADMIN (PDD §10.4.3). As seções entram uma a uma, a partir de Agendamentos.
test("COLABORADOR não entra em Configurações", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/painel/configuracoes");
  await expect(page).toHaveURL(/\/painel$/);
});
