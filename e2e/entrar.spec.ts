import { expect, type Page, test } from "@playwright/test";
import { codigoTotp, SENHA } from "./acesso";

// MIG-03: o login de ponta a ponta com as pessoas do supabase/seed.sql (só banco local e CI). A tela em si (textos,
// axe, Mostrar, POST) está no login.spec.ts do Frontend.
async function entrar(page: Page, email: string, caminho = "/login") {
  await page.goto(caminho);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

test("COLABORADOR entra sem 2º fator e volta para onde ia", async ({ page }) => {
  await page.goto("/painel/agenda?dia=2026-11-20");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel%2Fagenda%3Fdia%3D2026-11-20$/);
  await page.getByLabel("E-mail").fill("colaboradora.ficticia@exemplo.test");
  await page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/painel\/agenda\?dia=2026-11-20$/);
});

test("31 min sem atividade: a sessão é encerrada e o painel volta à tela de entrar", async ({ page, context, baseURL }) => {
  await entrar(page, "colaboradora.ficticia@exemplo.test");
  await expect(page).toHaveURL(/\/painel$/);
  const host = new URL(baseURL ?? "http://127.0.0.1:3000").hostname;
  const velho = String(Math.floor(Date.now() / 1000) - 31 * 60);
  await context.addCookies([{ name: "atta_atividade", value: velho, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel$/);
  const restantes = (await context.cookies()).filter((c) => c.name.startsWith("sb-") || c.name === "atta_atividade");
  expect(restantes.filter((c) => c.value !== "")).toEqual([]);
  await page.goto("/painel"); // a sessão não volta: o refresh foi revogado
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel$/);
});

test("volta para fora do painel é ignorada", async ({ page }) => {
  await entrar(page, "colaboradora.ficticia@exemplo.test", "/login?volta=%2F%2Fevil.example%2Fpainel");
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/painel$/);
});

test("conta sem clínica cai em /sem-clinica, e Sair encerra a sessão", async ({ page }) => {
  await entrar(page, "convidado.ficticio@exemplo.test");
  await expect(page).toHaveURL(/\/sem-clinica$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/sem-clinica$/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/login\?volta=%2Fpainel$/);
});

test("ADMIN sem 2º fator: o painel leva à ativação, e o código do app libera", async ({ page }) => {
  await entrar(page, "admin.novo.ficticio@exemplo.test", "/login?volta=%2Fpainel%2Fconfiguracoes");
  await expect(page).toHaveURL(/\/painel\/seguranca\/2fa\?volta=%2Fpainel%2Fconfiguracoes$/);
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/painel\/seguranca\/2fa\?volta=%2Fpainel$/);
  await page.getByRole("button", { name: "Gerar QR" }).click();
  await expect(page.getByRole("img", { name: "QR do app autenticador" })).toBeVisible();
  const chave = (await page.getByTestId("chave-totp").textContent()) ?? "";
  await page.getByLabel("Código").fill("000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Código incorreto.");
  await page.getByLabel("Código").fill(codigoTotp(chave));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await apagarFatores(page, "eeee0000-0000-4000-8000-0000000000a2"); // o teste pode rodar de novo no mesmo banco
});

// Desfaz a ativação pela API de administração do Auth local (chave secreta da instância local, nunca a da nuvem).
async function apagarFatores(page: Page, usuario: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave || !/^http:\/\/127\.0\.0\.1:/.test(url)) return;
  const cabecalhos = { apikey: chave, authorization: `Bearer ${chave}` };
  const resposta = await page.request.get(`${url}/auth/v1/admin/users/${usuario}/factors`, { headers: cabecalhos });
  for (const fator of (await resposta.json()) as { id: string }[]) {
    await page.request.delete(`${url}/auth/v1/admin/users/${usuario}/factors/${fator.id}`, { headers: cabecalhos });
  }
}
