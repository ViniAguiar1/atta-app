import { describe, expect, it } from "vitest";
import { cabecalhosDeSeguranca, politicaDeConteudo, ROTAS_COM_SEGREDO } from "./cabecalhos";

const diretiva = (csp: string, nome: string) =>
  csp
    .split("; ")
    .find((d) => d.startsWith(`${nome} `))
    ?.slice(nome.length + 1)
    .split(" ");

describe("cabeçalhos de segurança (S2-1)", () => {
  const producao = politicaDeConteudo({ desenvolvimento: false, supabaseUrl: "https://projeto.supabase.co/" });

  it("ninguém embute o app num frame, e nada de plugin nem de <base>", () => {
    expect(diretiva(producao, "frame-ancestors")).toEqual(["'none'"]);
    expect(diretiva(producao, "object-src")).toEqual(["'none'"]);
    expect(diretiva(producao, "base-uri")).toEqual(["'none'"]);
  });

  it("produção: sem eval, sem websocket e só a própria origem para script, fonte e conexão", () => {
    expect(diretiva(producao, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(diretiva(producao, "font-src")).toEqual(["'self'"]);
    expect(diretiva(producao, "connect-src")).toEqual(["'self'"]);
    expect(producao).not.toMatch(/unsafe-eval|ws:|\*/);
  });

  it("formulário só para a própria origem e para a origem do Supabase (sem caminho)", () => {
    expect(diretiva(producao, "form-action")).toEqual(["'self'", "https://projeto.supabase.co"]);
    expect(diretiva(politicaDeConteudo({ desenvolvimento: false, supabaseUrl: "javascript:alert(1)" }), "form-action")).toEqual([
      "'self'",
    ]);
    expect(diretiva(politicaDeConteudo({ desenvolvimento: false }), "form-action")).toEqual(["'self'"]);
  });

  it("desenvolvimento libera só o eval e o websocket do next dev", () => {
    const dev = politicaDeConteudo({ desenvolvimento: true });
    expect(diretiva(dev, "script-src")).toContain("'unsafe-eval'");
    expect(diretiva(dev, "connect-src")).toEqual(["'self'", "ws:"]);
  });

  it("toda rota recebe os gerais; as rotas com segredo vêm depois, com no-referrer, no-store e noindex", () => {
    const regras = cabecalhosDeSeguranca({ desenvolvimento: false });
    const [gerais, ...segredo] = regras;
    expect(gerais?.source).toBe("/:path*");
    const chaves = Object.fromEntries((gerais?.headers ?? []).map((h) => [h.key, h.value]));
    expect(chaves["X-Frame-Options"]).toBe("DENY");
    expect(chaves["X-Content-Type-Options"]).toBe("nosniff");
    expect(chaves["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(chaves["Permissions-Policy"]).toContain("camera=()");
    expect(segredo.map((r) => r.source)).toEqual([...ROTAS_COM_SEGREDO]);
    for (const r of segredo) {
      const h = Object.fromEntries(r.headers.map((c) => [c.key, c.value]));
      expect(h).toEqual({ "Referrer-Policy": "no-referrer", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    }
  });
});
