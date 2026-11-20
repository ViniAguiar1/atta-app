import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Tela de entrar (Simulador ATTA-in, captura 07; rota do PDD v206 §10.4.9) no build de produção.
const axe = (page: import("@playwright/test").Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
// regra do stage: nada de texto de ambiente nem de dica de acesso na tela
const PROIBIDO = /ambiente de valida|fict[ií]ci|\bdemo|demonstra[çc]|\bteste\b|aurora2026|000000|migra[çc]/i;

for (const [nome, viewport] of [["painel", { width: 1280, height: 800 }], ["celular", { width: 390, height: 844 }]] as const) {
  test(`${nome}: textos do simulador, axe sem violação e sem texto de ambiente`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Entrar no painel da clínica" })).toBeVisible();
    await expect(page.getByText("Acesso da equipe por convite do gestor da clínica.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toHaveAttribute("type", "email");
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    expect(await page.locator("body").innerText()).not.toMatch(PROIBIDO);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // só a página do artefato (correção do dono): sem o cabeçalho e o rodapé do site
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Esqueci a senha" })).toBeVisible();
  });
}

test("Mostrar alterna a senha visível, pelo teclado", async ({ page }) => {
  await page.goto("/login");
  const senha = page.getByLabel("Senha", { exact: true });
  await page.getByRole("button", { name: "Mostrar" }).focus();
  await page.keyboard.press("Enter");
  await expect(senha).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Ocultar" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(senha).toHaveAttribute("type", "password");
});

test("enviar vai por POST: e-mail e senha nunca na URL, e o erro aparece acima do botão", async ({ page }) => {
  const metodos: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/login" && r.method() !== "GET") metodos.push(r.method());
  });
  await page.goto("/login");
  // o anunciador de rota do Next também tem role="alert": o erro é procurado dentro do formulário
  const erro = page.locator("form").getByRole("alert");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(erro).toHaveText("Informe o e-mail e a senha.");

  await page.getByLabel("E-mail").fill("gestora@clinica.example");
  await page.getByLabel("Senha", { exact: true }).fill("senha-qualquer");
  await page.getByRole("button", { name: "Entrar" }).click();
  // conta que não existe: a mesma mensagem da senha errada (o e2e sobe o Supabase local desde o MIG-03b)
  await expect(erro).toHaveText("Credenciais inválidas.");
  expect(page.url()).toMatch(/\/login$/);
  expect(page.url()).not.toContain("senha");
  expect(metodos.length).toBeGreaterThan(0);
  expect(metodos.every((m) => m === "POST")).toBe(true);
  // o e-mail continua no campo e o foco volta para ele, para corrigir sem digitar tudo de novo
  await expect(page.getByLabel("E-mail")).toHaveValue("gestora@clinica.example");
  await expect(page.getByLabel("E-mail")).toBeFocused();
});
