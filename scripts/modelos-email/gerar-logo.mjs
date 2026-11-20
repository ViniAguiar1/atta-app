// Gera public/email/atta-in.png, o logo do cabeçalho dos e-mails do Auth: o mesmo lockup do /login (monograma de traço,
// "ATTA" em Allerta Stencil e "-in" em Montserrat), em on-brand sobre a barra brand, em 2× para tela retina.
// PNG porque o Gmail e o Outlook não mostram SVG. O fundo vai dentro da imagem: se o cliente de e-mail inverter as
// cores no modo escuro, o logo nunca fica branco sobre branco.
// Uso (só quando o lockup mudar): node scripts/modelos-email/gerar-logo.mjs
// As fontes vêm do Google Fonts só aqui, na hora de gerar; o e-mail não carrega fonte nem nada de fora.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const raiz = new URL("../../", import.meta.url);
const tokens = readFileSync(new URL("src/styles/tokens.css", raiz), "utf8");

// resolve um token semântico até o hex (ex.: --color-brand → var(--ref-atta-in) → #2c3128)
function token(nome) {
  const valor = tokens.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1]?.trim();
  if (!valor) throw new Error(`token ausente: ${nome}`);
  const ref = valor.match(/^var\((--[a-z0-9-]+)\)$/);
  return ref ? token(ref[1]) : valor;
}

const fundo = token("--color-brand");
const cor = token("--color-on-brand");

const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Allerta+Stencil&family=Montserrat:wght@500&display=block">
<style>
  body { margin: 0; }
  #logo { display: inline-flex; align-items: flex-end; gap: 4px; padding: 6px 8px; background: ${fundo}; color: ${cor}; line-height: 1; }
  #logo svg { width: 30px; height: 30px; }
  .atta { font-family: 'Allerta Stencil'; font-size: 27px; }
  .in { font-family: 'Montserrat'; font-weight: 500; font-size: 17px; }
</style></head><body>
<span id="logo">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 20 11 4l3 7M9 13h10M14.5 13v7" /></svg>
  <span class="atta">ATTA</span><span class="in">-in</span>
</span></body></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ deviceScaleFactor: 2 });
await pagina.setContent(html, { waitUntil: "networkidle" });
await pagina.evaluate(() => document.fonts.ready);
const caixa = await pagina.locator("#logo").boundingBox();
await pagina.locator("#logo").screenshot({ path: new URL("public/email/atta-in.png", raiz).pathname });
await navegador.close();
// o tamanho em CSS px vai no width/height do <img> do modelo (LOGO em modelos.ts)
process.stdout.write(`public/email/atta-in.png: ${Math.round(caixa.width)}×${Math.round(caixa.height)} px (CSS), 2×\n`);
