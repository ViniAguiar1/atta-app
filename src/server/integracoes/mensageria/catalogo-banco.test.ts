import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODELOS } from "./modelos";

// O catálogo do banco (integrations.template) recusa no enfileirar o que o código não conhece. Os dois têm de bater.
const pasta = join(process.cwd(), "supabase/migrations");
const migration = readFileSync(
  join(pasta, readdirSync(pasta).find((f) => f.endsWith("_integrations_delivery.sql")) ?? "x"),
  "utf8",
);
const linhas = new Map(
  [...migration.matchAll(/\('(\w+)', '\{([\w,]+)\}', '\{([\w,]+)\}', (true|false), (true|false)\)/g)].map((m) => [
    m[1],
    { canais: m[2]!.split(",").sort(), variaveis: m[3]!.split(","), essencial: m[4] === "true" },
  ]),
);

describe("catálogo de modelos: código × banco", () => {
  it("todo modelo do código está no banco com os mesmos canais, variáveis e essencial", () => {
    for (const [id, m] of Object.entries(MODELOS)) {
      expect(linhas.get(id), id).toEqual({
        canais: [...m.canais].sort(),
        variaveis: m.variaveis.map(([nome]) => nome),
        essencial: m.essencial,
      });
    }
  });

  it("o banco não tem modelo que o código não conhece", () => {
    expect([...linhas.keys()].sort()).toEqual(Object.keys(MODELOS).sort());
  });
});
