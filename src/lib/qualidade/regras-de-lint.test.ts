// @vitest-environment node
// As regras do Frontend no ESLint (ADR 0001 §6) rodando com a configuração de verdade (eslint.config.mjs): cor só por
// token, breakpoint só do tema e, junto, o HTML cru (ADR 0004 §3b). No flat config o no-restricted-syntax é uma regra só
// e o último bloco vence; este teste prova que nenhum bloco apaga os seletores de outro (já aconteceu com a cor).
import { join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..");
const eslint = new ESLint({ cwd: RAIZ });

async function mensagens(codigo: string, arquivo = "src/features/exemplo/Tela.tsx") {
  const [resultado] = await eslint.lintText(codigo, { filePath: join(RAIZ, arquivo) });
  return (resultado?.messages ?? []).filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message);
}

const tela = (classes: string) => `export const Tela = () => <div className="${classes}">x</div>;\n`;

describe("regras do tema no ESLint", { timeout: 60_000 }, () => {
  it("reprova os breakpoints do Tailwind que o tema zera, inclusive com variante e max-", async () => {
    for (const classe of ["sm:p-2", "md:flex", "lg:grid", "xl:w-1/2", "2xl:gap-4", "hover:lg:p-1", "max-md:hidden"]) {
      expect((await mensagens(tela(classe))).join(" "), classe).toMatch(/breakpoint só do tema/);
    }
  });

  it("aceita os breakpoints do tema", async () => {
    expect(await mensagens(tela("medium:p-2 expanded:flex large:grid extra-large:gap-4 max-medium:hidden"))).toEqual([]);
  });

  it("reprova também em template string", async () => {
    const codigo = "export const c = (a: boolean) => `flex ${a ? 'x' : 'y'} md:grid`;\n";
    expect((await mensagens(codigo)).join(" ")).toMatch(/breakpoint só do tema/);
  });

  it("a regra de cor continua valendo junto com as outras", async () => {
    expect((await mensagens(tela("bg-[#fff]"))).join(" ")).toMatch(/cor só por token/);
    expect((await mensagens(`export const T = () => <div style={{ color: "#000" }} />;\n`)).join(" ")).toMatch(/cor só por token/);
  });

  it("o HTML cru continua proibido, no código e nos testes", async () => {
    const codigo = "export function f(el: HTMLElement) { el.innerHTML = 'x'; }\n";
    expect((await mensagens(codigo, "src/features/exemplo/f.ts")).join(" ")).toMatch(/HTML cru/);
    expect((await mensagens(codigo, "src/features/exemplo/f.test.ts")).join(" ")).toMatch(/HTML cru/);
  });

  it("tamanho de texto solto vira aviso (warn), com o token no lugar; token, cor e testes não avisam", async () => {
    const avisos = async (codigo: string, arquivo = "src/features/exemplo/Tela.tsx") => {
      const [resultado] = await eslint.lintText(codigo, { filePath: join(RAIZ, arquivo) });
      return (resultado?.messages ?? []).filter((m) => m.ruleId === "tema/tamanho-de-texto");
    };
    for (const classe of ["text-[0.8125rem]", "text-[13px]", "hover:text-[0.6875rem]"]) {
      const [aviso] = await avisos(tela(classe));
      expect(aviso?.severity, classe).toBe(1);
      expect(aviso?.message).toMatch(/text-corpo \(13 px\).*text-destaque \(36 px\)/);
    }
    expect(await avisos(tela("text-corpo text-rotulo text-numero text-numero-menor text-destaque text-xs text-sm"))).toEqual([]);
    expect(await avisos(tela("text-[0.8125rem]"), "src/features/exemplo/Tela.test.tsx")).toEqual([]);
  });

  it("nos testes, cor e breakpoint não são cobrados", async () => {
    expect(await mensagens(tela("bg-[#fff] md:flex"), "src/features/exemplo/Tela.test.tsx")).toEqual([]);
  });
});
