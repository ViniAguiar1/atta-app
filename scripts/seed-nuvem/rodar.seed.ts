import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { CI_TEST_KEK_FINGERPRINT } from "@/server/cofre";
import { MasterKeyCofre, parseKeyring } from "@/server/cofre/master-key";
import { PACIENTES, parametrosDeCadastro } from "./pacientes";

// Roda o seed de pacientes fictícios no Supabase de destino, pelo cadastro da recepção (api.patient_register), com a
// sessão de um COLABORADOR ou ADMIN da clínica de destino. Uso (as chaves vêm do cofre, no próprio comando):
//   ATTA_SEED_RODAR=1 NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… ATTA_SEED_EMAIL=… \
//   ATTA_SEED_SENHA=… ATTA_CPF_PEPPER="$(cat …)" ATTA_REDE_CHAVE_MESTRA="$(cat …)" \
//   pnpm exec vitest run --config scripts/seed-nuvem/vitest.config.mts
// Idempotente: CPF já cadastrado na clínica é pulado. Imprime só contagens, nunca valor de chave nem dado do paciente.
const env = (nome: string) => {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} ausente`);
  return v;
};

describe.runIf(process.env.ATTA_SEED_RODAR === "1")("seed de pacientes fictícios", () => {
  it("cadastra os pacientes na clínica da sessão", { timeout: 300_000 }, async () => {
    const url = env("NEXT_PUBLIC_SUPABASE_URL");
    const nuvem = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url);
    // na nuvem, a KEK de teste do CI é recusada (mesma regra do getCofre em produção)
    const cofre = new MasterKeyCofre(parseKeyring(env("ATTA_REDE_CHAVE_MESTRA"), nuvem ? new Set([CI_TEST_KEK_FINGERPRINT]) : new Set(), "ATTA_REDE_CHAVE_MESTRA"));
    const pepperHex = env("ATTA_CPF_PEPPER");
    if (!/^([0-9a-f]{2}){32,}$/.test(pepperHex)) throw new Error("ATTA_CPF_PEPPER malformado");
    const pepperCpf = Buffer.from(pepperHex, "hex");

    const supabase = createClient(url, env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
    const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: env("ATTA_SEED_EMAIL"), password: env("ATTA_SEED_SENHA") });
    if (erroLogin) throw new Error(`login recusado: ${erroLogin.code ?? erroLogin.status}`);

    const contagem = { novos: 0, jaExistiam: 0, erros: 0 };
    for (const p of PACIENTES) {
      const { error } = await supabase.schema("api").rpc("patient_register", await parametrosDeCadastro(p, { cofre, pepperCpf }));
      if (!error) contagem.novos++;
      else if (error.code === "23505") contagem.jaExistiam++;
      else {
        contagem.erros++;
        process.stdout.write(`erro no paciente ${p.id}: ${error.code} ${error.message}\n`);
      }
    }
    pepperCpf.fill(0);
    process.stdout.write(`seed: ${PACIENTES.length} pacientes · ${contagem.novos} novos · ${contagem.jaExistiam} já existiam · ${contagem.erros} erros\n`);
    expect(contagem.erros).toBe(0);
  });
});
