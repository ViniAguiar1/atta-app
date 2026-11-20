// Fronteira entre módulos (ADR 0001 §4): src/features/<modulo> não importa de outro módulo; o que é comum sobe para
// src/components/ui ou src/lib. Resolve o import (@/ ou relativo) para a pasta de destino e compara com a do arquivo.
// Porte simplificado de eslint-rules/camadas.js dos painéis antigos.
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "..", "src");

function moduloDe(arquivo) {
  const rel = path.relative(SRC, arquivo).split(path.sep);
  return rel[0] === "features" && rel.length > 2 ? rel[1] : null;
}

function destino(origem, fonte) {
  if (fonte.startsWith("@/")) return path.join(SRC, fonte.slice(2));
  if (fonte.startsWith(".")) return path.resolve(path.dirname(origem), fonte);
  return null;
}

const fronteiraEntreModulos = {
  meta: { type: "problem", schema: [], docs: { description: "feature não importa de outra feature (ADR 0001 §4)" } },
  create(context) {
    const origem = context.filename;
    const meu = moduloDe(origem);
    if (!meu) return {};
    const conferir = (no) => {
      const alvo = destino(origem, String(no.source.value));
      const dele = alvo && moduloDe(path.join(alvo, "x"));
      if (dele && dele !== meu)
        context.report({ node: no.source, message: `features/${meu} não importa features/${dele}: suba o que é comum para components/ui ou lib (ADR 0001 §4)` });
    };
    return { ImportDeclaration: conferir, ExportNamedDeclaration: (no) => no.source && conferir(no), ExportAllDeclaration: conferir };
  },
};

export const fronteiras = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { atta: { rules: { "fronteira-entre-modulos": fronteiraEntreModulos } } },
  rules: { "atta/fronteira-entre-modulos": "error" },
};
