import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { SESSAO_DA_GESTORA } from "./acesso";

// Configurações › Notificações (PDD v206 §10.4.6) com a porta real do MIG-15 e a sessão da gestora do seed (ADMIN).
// Clínica nova vem com tudo desligado: o teste liga o e-mail com um destino fictício (destino + ligar numa chamada,
// cifrado pelo Cofre), marca um evento, recarrega para ver que ficou no banco e desfaz tudo no fim.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
const EVENTO = "Novo modelo de documento criado por E-mail";

test.use({ storageState: SESSAO_DA_GESTORA });

test("liga o e-mail com destino, grava a marcação de um evento e só mostra o destino mascarado", async ({ page }) => {
  await page.goto("/painel/configuracoes/notificacoes");
  const eventos = page.getByRole("region", { name: "Eventos configuráveis" });
  await expect(eventos).toContainText("10 eventos em 3 categorias");
  await expect(eventos.getByRole("rowheader")).toHaveCount(10);
  for (const c of ["Check-in & Atendimentos", "Documentos & Modelos", "Sistema & Conta"]) await expect(eventos).toContainText(c);
  expect((await axe(page)).violations).toEqual([]);

  const ligarEmail = page.getByRole("checkbox", { name: "Receber alertas por E-mail" });
  if (!(await ligarEmail.isChecked())) {
    await ligarEmail.click(); // sem destino salvo: abre o campo, nada vai ao banco ainda
    await page.getByLabel("E-mail que recebe os alertas").fill("alertas@clinica-ficticia.test");
    await page.getByLabel("E-mail que recebe os alertas").press("Enter");
  }
  await expect(page.getByText(/E-mail cadastrado: al•••@cl•••\.test/)).toBeVisible();
  await expect(page.getByText("alertas@clinica-ficticia.test")).toHaveCount(0); // nunca em claro na tela

  const caixa = page.getByRole("checkbox", { name: EVENTO });
  await expect(caixa).toBeEnabled();
  const antes = await caixa.isChecked();
  await caixa.click();
  await expect(caixa).toBeChecked({ checked: !antes });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: EVENTO })).toBeChecked({ checked: !antes });

  // desfaz: a marcação volta e o e-mail desliga (a base fica como a clínica nova)
  await page.getByRole("checkbox", { name: EVENTO }).click();
  await expect(page.getByRole("checkbox", { name: EVENTO })).toBeChecked({ checked: antes });
  await page.getByRole("checkbox", { name: "Receber alertas por E-mail" }).click();
  await expect(page.getByRole("checkbox", { name: "Receber alertas por E-mail" })).not.toBeChecked();
});
