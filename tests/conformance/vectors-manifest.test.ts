// Os vetores são cópia fiel do atta-core e não mudam: cada arquivo bate com tests/vectors/SHA256SUMS,
// e nenhum arquivo sobra ou falta. Mudança de cálculo nasce como atta_sign_v2 ao lado, com manifesto próprio.
// (O job de CI que barra diff em tests/vectors/** entra quando o MIG-01 trouxer o workflow.)
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

const RAIZ = join(__dirname, "../vectors");
const PASTAS = ["atta_sign_v1", "crypto_v1", "rfc8785"];

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name !== "README.md")
    .map((d) => relative(RAIZ, join(d.parentPath, d.name)));
}

it("vetores batem com o SHA256SUMS, sem sobra nem falta", () => {
  const esperado = new Map(
    readFileSync(join(RAIZ, "SHA256SUMS"), "utf8")
      .trim()
      .split("\n")
      .map((l) => {
        const [hash, caminho] = l.split(/\s+/, 2);
        return [caminho, hash] as const;
      }),
  );
  const presentes = PASTAS.flatMap((p) => arquivos(join(RAIZ, p))).sort();
  expect(presentes).toEqual([...esperado.keys()].sort());
  for (const caminho of presentes) {
    expect(createHash("sha256").update(readFileSync(join(RAIZ, caminho))).digest("hex"), caminho).toBe(esperado.get(caminho));
  }
});
