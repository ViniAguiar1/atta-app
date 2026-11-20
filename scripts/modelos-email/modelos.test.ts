// @vitest-environment node
import { describe, expect, it } from "vitest";
import { COR, MODELOS, renderizar } from "./modelos";

// Os .html em supabase/templates são o que o Supabase envia: têm de ser exatamente o que o modelo gera.
// Mudou o modelo? pnpm vitest run scripts/modelos-email -u e confira o diff.
describe.each(MODELOS)("modelo $arquivo", (m) => {
  const html = renderizar(m);

  it("é o arquivo que o Supabase lê", async () => {
    await expect(html).toMatchFileSnapshot(`../../supabase/templates/${m.arquivo}`);
  });

  it("usa só as variáveis do Supabase previstas", () => {
    const variaveis = new Set(html.match(/\{\{[^}]*\}\}/g));
    expect([...variaveis].sort()).toEqual(["{{ .SiteURL }}", "{{ .TokenHash }}"]);
  });

  it("leva ao /auth/confirm com o tipo certo, no botão e no link em texto", () => {
    const link = `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${m.tipo}`;
    expect(html.split(`href="${link}"`)).toHaveLength(3);
    expect(html).toContain(`>${link}</a>`);
  });

  it("é HTML de e-mail: tabelas de apresentação, sem script, sem nada de fora e com o logo descrito", () => {
    expect(html).toContain('<html lang="pt-BR"');
    const tabelas = html.match(/<table\b[^>]*>/g) ?? [];
    expect(tabelas.length).toBeGreaterThan(0);
    for (const t of tabelas) expect(t).toContain('role="presentation"');
    expect(html).not.toMatch(/<script|<link|@import|@font-face|javascript:/i);
    // todo endereço é do próprio app: nada de fonte, imagem ou pixel de outro serviço
    const enderecos = [...html.matchAll(/(?:src|href)="([^"]*)"/g)].map((r) => r[1]);
    for (const e of enderecos) expect(e?.startsWith("{{ .SiteURL }}/")).toBe(true);
    const imagens = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imagens).toHaveLength(1);
    expect(imagens[0]).toContain('alt="ATTA-in"');
  });

  it("não traz dado pessoal nem palavra de ambiente de teste (stage = produção)", () => {
    expect(html).not.toMatch(/\{\{ \.(Email|Data|NewEmail|Token) \}\}/);
    expect(html).not.toMatch(/\b(teste|demo|demonstração|validação|fictício|staging|ambiente)\b/i);
  });

  it("diz o que fazer se a pessoa não pediu e quanto tempo o link vale", () => {
    expect(html).toContain("ignore este e-mail");
    expect(html).toContain("O link vale 1 hora e só funciona uma vez.");
  });
});

// Contraste WCAG 2.1 AA (4,5:1 no texto normal) dos pares usados, no claro e no escuro.
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("contraste AA", () => {
  it.each([
    ["texto no cartão", COR.texto, COR.cartao],
    ["texto secundário no cartão", COR.textoSecundario, COR.cartao],
    ["rodapé no fundo", COR.textoSecundario, COR.fundo],
    ["botão", COR.sobreMarca, COR.marca],
    ["escuro: texto no cartão", COR.sobreMarca, COR.marca],
    ["escuro: botão", COR.marca, COR.sobreMarca],
    ["escuro: rodapé no fundo", COR.borda, COR.texto],
  ])("%s ≥ 4,5:1", (_nome, frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });
});
