import { expect, test } from "@playwright/test";

// Auditoria de segurança S2-1 (PDD v206 §19.3; ADR 0004 §3): toda resposta leva os cabeçalhos de segurança, e as rotas
// com segredo no caminho não vazam Referer nem ficam em cache. A tela de entrar roda sem violação da CSP.

const GERAIS = ["/login", "/checkin/aurora", "/sem-clinica", "/rota-que-nao-existe"];

for (const caminho of GERAIS) {
  test(`${caminho}: cabeçalhos de segurança`, async ({ request }) => {
    const r = await request.get(caminho, { maxRedirects: 0 });
    const h = r.headers();
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["content-security-policy"]).toContain("object-src 'none'");
    expect(h["content-security-policy"]).not.toContain("unsafe-eval");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["permissions-policy"]).toContain("camera=()");
  });
}

for (const caminho of ["/b/segredo-ficticio-de-exemplo", "/boarding", "/propass/segredo-ficticio-de-exemplo"]) {
  test(`${caminho}: rota com segredo sem Referer, sem cache e sem índice`, async ({ request }) => {
    const h = (await request.get(caminho, { maxRedirects: 0 })).headers();
    expect(h["referrer-policy"]).toBe("no-referrer");
    expect(h["cache-control"]).toContain("no-store");
    expect(h["x-robots-tag"]).toContain("noindex");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  });
}

test("a tela de entrar carrega sem violação da CSP", async ({ page }) => {
  const violacoes: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(m.text())) violacoes.push(m.text());
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(violacoes).toEqual([]);
});
