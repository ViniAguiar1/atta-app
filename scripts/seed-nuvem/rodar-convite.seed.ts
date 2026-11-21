import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CI_TEST_KEK_FINGERPRINT } from "@/server/cofre";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { CI_TEST_PEPPER_FINGERPRINTS } from "@/server/crypto/pepper";
import { gerarSegredo } from "@/server/grant/politica";
import { gerarConvite } from "./convite-propass";

// Gera o convite de PROpass fictício (convite-propass.ts): o SQL vai para um arquivo FORA do repositório, que o Backend 1
// aplica na nuvem e apaga; o link vai SÓ para o arquivo do QA, em modo 600, que o Backend 1 apaga depois do envio de ponta
// a ponta (CTO, ADR 0006). Uso (chaves do cofre, no comando; nada no stdout além da contagem):
//   ATTA_SEED_CONVITE=1 ATTA_SEED_NUVEM=1 ATTA_SEED_SAIDA=/tmp/…sql ATTA_SEED_LINK=/Users/macbook/OpenBot/Shared/atta/migracao/qa/propass-convite.md \
//   ATTA_SEED_BASE_URL=https://<produção> ATTA_SEED_CONVITE_N=1 ATTA_CPF_PEPPER="$(cat …)" ATTA_REDE_CHAVE_MESTRA="$(cat …)" \
//   pnpm exec vitest run --config scripts/seed-nuvem/vitest.config.mts rodar-convite
//   psql … -v ON_ERROR_STOP=1 -f /tmp/…sql; rm -f /tmp/…sql
const env = (nome: string) => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente`);
  return v;
};
const foraDoRepo = (caminho: string) => isAbsolute(caminho) && relative(process.cwd(), resolve(caminho)).startsWith("..");

describe.runIf(process.env.ATTA_SEED_CONVITE === "1")("convite de PROpass fictício", () => {
  it("gera o SQL e grava o link só no arquivo do QA", async () => {
    const saida = env("ATTA_SEED_SAIDA");
    const arquivoDoLink = env("ATTA_SEED_LINK");
    if (!foraDoRepo(saida) || !foraDoRepo(arquivoDoLink)) throw new Error("ATTA_SEED_SAIDA e ATTA_SEED_LINK precisam ser caminhos absolutos fora do repositório");
    const nuvem = process.env.ATTA_SEED_NUVEM === "1";
    const cofre = new MasterKeyCofre(parseKeyring(env("ATTA_REDE_CHAVE_MESTRA"), nuvem ? new Set([CI_TEST_KEK_FINGERPRINT]) : new Set(), "ATTA_REDE_CHAVE_MESTRA"));
    const pepperHex = env("ATTA_CPF_PEPPER");
    if (!/^([0-9a-f]{2}){32,}$/.test(pepperHex)) throw new Error("ATTA_CPF_PEPPER malformado");
    const pepperCpf = Buffer.from(pepperHex, "hex");
    if (nuvem && CI_TEST_PEPPER_FINGERPRINTS.has(createHash("sha256").update(pepperCpf).digest("hex"))) throw new Error("ATTA_CPF_PEPPER usa pepper de teste");
    try {
      const { sql, link } = await gerarConvite({
        cofre,
        pepperCpf,
        numero: Number(process.env.ATTA_SEED_CONVITE_N ?? "1"),
        segredo: gerarSegredo(),
        baseUrl: env("ATTA_SEED_BASE_URL"),
      });
      writeFileSync(saida, sql, { mode: 0o600 });
      writeFileSync(arquivoDoLink, `# Convite de PROpass de teste (fictício; apagar depois do envio de ponta a ponta)\n\n${link}\n`, { mode: 0o600 });
    } finally {
      pepperCpf.fill(0);
    }
    process.stdout.write("convite: 1 SQL gerado; link gravado só no arquivo do QA\n");
    expect(true).toBe(true);
  });
});
