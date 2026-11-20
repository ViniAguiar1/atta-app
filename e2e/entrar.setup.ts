import { expect, test as setup } from "@playwright/test";
import { codigoTotp, INICIO_DO_PAINEL, SEGREDO_DA_GESTORA, SENHA, SESSAO_DA_GESTORA } from "./acesso";

// Entra uma vez como a gestora fictícia do seed (ADMIN, com TOTP) e guarda a sessão para os testes do painel.

setup("entrar como a gestora (senha e segundo fator)", async ({ page }) => {
  await page.goto("/painel");
  await page.getByLabel("E-mail").fill("gestora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel\/seguranca\/2fa\?volta=%2Fpainel$/);
  await page.getByLabel("Código").fill(codigoTotp(SEGREDO_DA_GESTORA));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);
  await page.context().storageState({ path: SESSAO_DA_GESTORA });
});
