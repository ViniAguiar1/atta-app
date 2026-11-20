import { INICIO_DO_PAINEL } from "./acesso";
import { expect, type APIRequestContext, test } from "@playwright/test";

// MIG-03c: "Esqueci a senha" de ponta a ponta, com o Mailpit do Supabase local (porta da API + 3). A pessoa é a do seed
// só para este teste; a senha dela muda, e o teste roda de novo sem reset (não depende da senha antiga).
const EMAIL = "recupera.ficticia@exemplo.test";
const NOVA = "NovaSenhaFicticia2026";

function mailpit(): string | null {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!api || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) return null;
  const u = new URL(api);
  return `http://127.0.0.1:${Number(u.port) + 3}`;
}

async function linkDoEmail(request: APIRequestContext, base: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const busca = await request.get(`${base}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL}`)}`);
    const { messages } = (await busca.json()) as { messages: { ID: string }[] };
    if (messages.length) {
      const msg = (await (await request.get(`${base}/api/v1/message/${messages[0]!.ID}`)).json()) as { HTML: string };
      const href = /href="([^"]*\/auth\/confirm\?[^"]+)"/.exec(msg.HTML)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("e-mail de recuperação não chegou ao Mailpit");
}

test("Esqueci a senha: o link do e-mail leva à nova senha, e ela passa a valer", async ({ page, request }) => {
  const base = mailpit();
  test.skip(!base, "sem Supabase local no ambiente");
  await request.delete(`${base}/api/v1/search?query=${encodeURIComponent(`to:${EMAIL}`)}`);

  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci a senha" }).click();
  await expect(page).toHaveURL(/\/login\/esqueci$/);
  await page.getByLabel("E-mail de acesso").fill(EMAIL);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Se este e-mail tiver acesso a uma clínica ATTA, ele recebe um link para criar nova senha.",
  );

  const link = new URL(await linkDoEmail(request, base!));
  const caminho = `${link.pathname}${link.search}`; // o SiteURL local aponta para a porta da sigla; segue no app em teste
  // um filtro de e-mail abre o link (GET) sozinho: isso não pode gastar o token
  expect((await request.get(caminho)).status()).toBe(200);
  await page.goto(caminho);
  await expect(page.getByRole("heading", { level: 1, name: "Confirmar acesso" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/definir-senha\?fluxo=recuperar$/);
  await page.getByLabel("Nova senha", { exact: true }).fill("curta1");
  await page.getByLabel("Repita a nova senha").fill("curta1");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Use 12 ou mais caracteres, com letras e números.");
  await page.getByLabel("Nova senha", { exact: true }).fill(NOVA);
  await page.getByLabel("Repita a nova senha").fill(NOVA);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);

  // o link é de uso único: a página abre, mas o botão não confere de novo
  await page.context().clearCookies();
  await page.goto(caminho);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/login\?erro=link$/);

  // e a senha nova vale no login
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(EMAIL);
  await page.getByLabel("Senha", { exact: true }).fill(NOVA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(INICIO_DO_PAINEL);
});

test("Esqueci a senha com e-mail sem conta: a mesma resposta, e nenhum e-mail sai", async ({ page, request }) => {
  const base = mailpit();
  test.skip(!base, "sem Supabase local no ambiente");
  const ninguem = "ninguem.ficticio@exemplo.test";
  await page.goto("/login/esqueci");
  await page.getByLabel("E-mail de acesso").fill(ninguem);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Se este e-mail tiver acesso a uma clínica ATTA, ele recebe um link para criar nova senha.",
  );
  const busca = await request.get(`${base}/api/v1/search?query=${encodeURIComponent(`to:${ninguem}`)}`);
  expect(((await busca.json()) as { messages: unknown[] }).messages).toEqual([]);
});

test("link de e-mail inválido não abre sessão", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=invalido123&type=recovery");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/login\?erro=link$/);
  await page.goto("/auth/confirm?token_hash=qualquer123&type=signup");
  await expect(page.getByText("Este link não é válido.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar" })).toHaveCount(0);
});
