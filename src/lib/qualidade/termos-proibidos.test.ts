// O stage é uma réplica exata da produção (regra do dono, 20/11; PLANO e ADR 0001 §5): nenhum texto de ambiente,
// de teste ou de demonstração na interface. A diferença entre stage e produção fica só em variável de ambiente e nos
// adaptadores (simuladores), nunca no texto. Valores para testar vão para migracao/guia-de-teste.md (QA).
//
// O teste lê só o texto que chega à tela: strings e texto de JSX dos arquivos de interface. Comentário, identificador
// e caminho de import não contam (a porta simulada pode se chamar `portaSimulada`).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..", "..");
// Onde mora a interface: rotas, telas e textos das features e componentes compartilhados.
const PASTAS = ["src/app", "src/features", "src/components"];

const PROIBIDOS: ReadonlyArray<readonly [nome: string, padrao: RegExp]> = [
  ["ambiente de validação", /ambiente\s+de\s+valida[çc][ãa]o/i],
  ["fictício", /\bfict[íi]ci[oa]s?\b/i],
  ["demo / demonstração", /\bdemo\b|\bdemonstra[çc][ãa]o\b/i],
  ["teste / testar", /\btestes?\b|\btestar\b/i],
  ["simulado / simulador", /\bsimula(d[oa]s?|dor(es)?|[çc][ãa]o)\b/i],
  ["stage / staging", /\bstag(e|ing)\b/i],
  ["dica de código", /use\s+o\s+c[óo]digo/i],
  ["página-marcador", /\bmigra[çc][ãa]o\b|em\s+constru[çc][ãa]o|pr[óo]ximos\s+itens/i],
  // CPF formatado na tela só como máscara de exemplo (000.000.000-00)
  ["CPF na tela", /\b(?!000\.000\.000-00)\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
];

// Exceções que vencem: cada uma tem dono e item. Quando o texto sair, o teste "exceção vencida" obriga a apagar a
// linha. Não se acrescenta exceção nova sem o ok do Tech Lead.
const EXCECOES: ReadonlyArray<{ arquivo: string; termo: string; dono: string }> = [];

function arquivosDeInterface(pasta: string): string[] {
  return readdirSync(join(RAIZ, pasta), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.(ts|tsx)$/.test(e.name))
    .map((e) => relative(RAIZ, join(e.parentPath, e.name)));
}

/** Textos que chegam à tela: strings, templates e texto de JSX, sem import/export de módulo. */
export function textosVisiveis(codigo: string, nome = "x.tsx"): string[] {
  const fonte = ts.createSourceFile(nome, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const textos: string[] = [];
  const visitar = (no: ts.Node) => {
    if (ts.isImportDeclaration(no) || ts.isExportDeclaration(no) || ts.isExternalModuleReference(no)) return;
    if (ts.isCallExpression(no) && no.expression.kind === ts.SyntaxKind.ImportKeyword) return;
    if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) textos.push(no.text);
    else if (ts.isTemplateExpression(no)) {
      textos.push(no.head.text, ...no.templateSpans.map((s) => s.literal.text));
    } else if (ts.isJsxText(no)) textos.push(no.text);
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return textos.filter((t) => t.trim().length > 0);
}

function violacoes() {
  const achadas: { arquivo: string; termo: string; texto: string }[] = [];
  for (const arquivo of PASTAS.flatMap(arquivosDeInterface)) {
    for (const texto of textosVisiveis(readFileSync(join(RAIZ, arquivo), "utf8"), arquivo)) {
      for (const [termo, padrao] of PROIBIDOS) if (padrao.test(texto)) achadas.push({ arquivo, termo, texto });
    }
  }
  return achadas;
}

describe("interface sem texto de ambiente (stage = produção)", () => {
  const achadas = violacoes();
  const excecao = (v: { arquivo: string; termo: string }) =>
    EXCECOES.some((e) => e.arquivo === v.arquivo && e.termo === v.termo);

  it("nenhum termo proibido fora das exceções", () => {
    expect(achadas.filter((v) => !excecao(v)).map((v) => `${v.arquivo}: "${v.texto.trim()}" (${v.termo})`)).toEqual([]);
  });

  it("exceção vencida: o texto já saiu, apague a linha de EXCECOES", () => {
    expect(EXCECOES.filter((e) => !achadas.some((v) => v.arquivo === e.arquivo && v.termo === e.termo))).toEqual([]);
  });
});

describe("o leitor de texto visível", () => {
  it("pega string, template e texto de JSX", () => {
    const t = textosVisiveis('const a = "um"; const b = `dois ${a} três`; const c = <p>quatro</p>;');
    expect(t).toEqual(["um", "dois ", " três", "quatro"]);
  });

  it("ignora comentário, identificador e import", () => {
    const t = textosVisiveis('import { portaSimulada } from "./simulado";\n// ambiente de teste\nconst modoSimulado = 1;');
    expect(t).toEqual([]);
  });

  it("acusa cada termo proibido e aceita a máscara de exemplo do CPF", () => {
    const acusa = (s: string) => PROIBIDOS.some(([, p]) => p.test(s));
    for (const s of ["Ambiente de validação", "dados fictícios", "Clínica demo", "modo de teste", "porta simulada",
      "stage", "use o código 123456", "529.982.247-25", "Esta área chega nos próximos itens da migração."]) expect(acusa(s), s).toBe(true);
    for (const s of ["000.000.000-00", "Agendamentos", "Código de verificação", "Atestado"]) expect(acusa(s), s).toBe(false);
  });
});
