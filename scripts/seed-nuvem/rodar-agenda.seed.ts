import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CI_TEST_KEK_FINGERPRINT } from "@/server/cofre";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { CI_TEST_PEPPER_FINGERPRINTS } from "@/server/crypto/pepper";
import { PROFISSIONAIS, sqlDosProfissionais } from "./profissionais";

// Gera o SQL dos profissionais fictícios da Agenda (cifrado com a KEK e o pepper de destino) num arquivo FORA do
// repositório, para o Backend 1 aplicar na nuvem com o agenda.sql logo depois e apagar. Uso (chaves do cofre, no comando):
//   ATTA_SEED_AGENDA=1 ATTA_SEED_SAIDA=/tmp/…sql ATTA_SEED_NUVEM=1 ATTA_CPF_PEPPER="$(cat …)" \
//   ATTA_REDE_CHAVE_MESTRA="$(cat …)" pnpm exec vitest run --config scripts/seed-nuvem/vitest.config.mts rodar-agenda
//   psql … -v ON_ERROR_STOP=1 -1 -f /tmp/…sql; rm -f /tmp/…sql; psql … -v ON_ERROR_STOP=1 -f scripts/seed-nuvem/agenda.sql
// (o rm vem no mesmo comando do psql, dê certo ou não)
// O arquivo só tem bytes cifrados, HMAC e CPF mascarado; nenhuma chave. Imprime só a contagem.
const env = (nome: string) => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente`);
  return v;
};

describe.runIf(process.env.ATTA_SEED_AGENDA === "1")("seed da agenda fictícia", () => {
  it("gera o SQL dos profissionais", async () => {
    const saida = resolve(env("ATTA_SEED_SAIDA"));
    const dentroDoRepo = !relative(process.cwd(), saida).startsWith("..");
    if (!isAbsolute(env("ATTA_SEED_SAIDA")) || dentroDoRepo) throw new Error("ATTA_SEED_SAIDA precisa ser um caminho absoluto fora do repositório");
    // na nuvem, a KEK de teste do CI é recusada (mesma regra do getCofre em produção)
    const nuvem = process.env.ATTA_SEED_NUVEM === "1";
    const cofre = new MasterKeyCofre(parseKeyring(env("ATTA_REDE_CHAVE_MESTRA"), nuvem ? new Set([CI_TEST_KEK_FINGERPRINT]) : new Set(), "ATTA_REDE_CHAVE_MESTRA"));
    const pepperHex = env("ATTA_CPF_PEPPER");
    if (!/^([0-9a-f]{2}){32,}$/.test(pepperHex)) throw new Error("ATTA_CPF_PEPPER malformado");
    const pepperCpf = Buffer.from(pepperHex, "hex");
    // e o pepper de teste também (nota da Segurança no #176), como no pepperFromEnv
    if (nuvem && CI_TEST_PEPPER_FINGERPRINTS.has(createHash("sha256").update(pepperCpf).digest("hex"))) throw new Error("ATTA_CPF_PEPPER usa pepper de teste");
    try {
      writeFileSync(saida, await sqlDosProfissionais({ cofre, pepperCpf }), { mode: 0o600 });
    } finally {
      pepperCpf.fill(0);
    }
    process.stdout.write(`agenda: SQL de ${PROFISSIONAIS.length} profissionais gerado\n`);
    expect(PROFISSIONAIS).toHaveLength(4);
  });
});
