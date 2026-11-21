// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// ADR 0001 §6: o @theme do tokens.theme.css zera as cores, fontes e tamanhos genéricos do Tailwind, para que só
// existam classes de token (o Guia de Design §1.3 proíbe bg-gray-*, text-red-* e afins). Se uma cópia nova dos tokens
// perder um desses resets, este teste reprova.
const estilos = import.meta.dirname;
const ler = (arquivo: string) => readFileSync(path.join(estilos, arquivo), "utf8");
const tema = ler("tokens.theme.css");
const blocoDoTema = tema.slice(tema.indexOf("@theme"));

describe("tokens", () => {
  it.each(["--color-*", "--font-*", "--text-*"])("o @theme zera %s do Tailwind", (namespace) => {
    expect(blocoDoTema).toMatch(new RegExp(`${namespace.replace("*", "\\*")}\\s*:\\s*initial\\s*;`));
  });

  it.each(["tokens.css", "tokens.theme.css"])("%s traz no cabeçalho o commit de origem do atta-platform", (arquivo) => {
    expect(ler(arquivo).split("\n")[0]).toMatch(/atta-platform design\/tokens\/.+, commit [0-9a-f]{7}/);
  });

  it("o globals.css importa tailwindcss, tokens.css e tokens.theme.css, nesta ordem", () => {
    const imports = [...ler("globals.css").matchAll(/@import\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["tailwindcss", "./tokens.css", "./tokens.theme.css"]);
  });

  it.each(["--color-status-ready", "--color-brand-active", "--color-status-active"])("%s existe no tokens.css e no @theme (classe do Tailwind)", (token) => {
    expect(ler("tokens.css")).toContain(`${token}:`);
    expect(blocoDoTema).toContain(`${token}:`);
  });
});
