import type { Cofre } from "@/server/cofre";
import { cpfHmacWith, isValidCpf, maskCpf } from "@/server/crypto/cpf";
import { emailHmacWith } from "@/server/crypto/email";
import { columnAad, seal } from "@/server/crypto/envelope";
import { cpfDe } from "./pacientes";

// Profissionais FICTÍCIOS do stage, para a Agenda da Aurora e da Serena (pedido do CTO, 20/11): CPF gerado, nome
// inventado, e-mail @exemplo.test, registro com zeros à esquerda (fora da numeração real). Entram já com o PROpass
// feito, como o seed local do #141: o convite por e-mail fica de fora (nada é enviado). Só a lógica: as chaves vêm do
// ambiente na hora de rodar (rodar-agenda.seed.ts).
// Envelope pela ADR 0002 §6, igual ao seed local:
//   profissional (dado de rede): DEK ('', platform.professional, dek, id); colunas columnAad('', platform.professional, col, id)
//   vínculo: DEK (clínica, platform.professional_tenant_link, dek, envelope_id); invite_email_enc com a AAD do vínculo
// O e-mail usa o HMAC do app (emailHmacWith, pepper do CPF com rótulo próprio).

export const AURORA = "0a770000-0000-4000-8000-000000000001";
export const SERENA = "0a770000-0000-4000-8000-000000000002";

export type ProfissionalFicticio = {
  id: string;
  vinculo: string;
  envelope: string;
  clinica: string;
  nome: string;
  conselho: "crm" | "esteticista_ou_equivalente";
  uf: string;
  registro: string;
  cpfBase: string;
  email: string;
};

const uuid = (n: number) => `0a770000-0000-4000-8000-${n.toString().padStart(12, "0")}`;

export const PROFISSIONAIS: readonly ProfissionalFicticio[] = [
  { id: uuid(301), vinculo: uuid(311), envelope: uuid(321), clinica: AURORA, nome: "Dra. Marina Valadares", conselho: "crm", uf: "SP", registro: "000901", cpfBase: "190283746", email: "marina.valadares@exemplo.test" },
  { id: uuid(302), vinculo: uuid(312), envelope: uuid(322), clinica: AURORA, nome: "Paula Esteves Brandão", conselho: "esteticista_ou_equivalente", uf: "SP", registro: "000902", cpfBase: "281394857", email: "paula.esteves@exemplo.test" },
  { id: uuid(303), vinculo: uuid(313), envelope: uuid(323), clinica: SERENA, nome: "Dr. Henrique Sampaio", conselho: "crm", uf: "SP", registro: "000903", cpfBase: "372405968", email: "henrique.sampaio@exemplo.test" },
  { id: uuid(304), vinculo: uuid(314), envelope: uuid(324), clinica: SERENA, nome: "Dra. Lúcia Fontenelle", conselho: "crm", uf: "SP", registro: "000904", cpfBase: "463517079", email: "lucia.fontenelle@exemplo.test" },
];

const bytea = (b: Uint8Array) => `'\\x${Buffer.from(b).toString("hex")}'`;
const texto = (s: string) => `'${s.replaceAll("'", "''")}'`;

/**
 * SQL dos profissionais e dos vínculos, já cifrados (idempotente: on conflict do nothing). Sai só id, nome, conselho,
 * CPF mascarado e bytes cifrados ou HMAC; nenhum CPF, e-mail ou chave em claro.
 */
export async function sqlDosProfissionais(chaves: { cofre: Cofre; pepperCpf: Uint8Array }): Promise<string> {
  const linhas: string[] = [];
  for (const p of PROFISSIONAIS) {
    const cpf = cpfDe(p.cpfBase);
    if (!isValidCpf(cpf)) throw new Error("CPF gerado inválido");
    const emailHmac = bytea(emailHmacWith(chaves.pepperCpf, p.email));

    const dp = await chaves.cofre.generateDataKey({ tenant_id: "", table: "platform.professional", column: "dek", id: p.id });
    const dv = await chaves.cofre.generateDataKey({ tenant_id: p.clinica, table: "platform.professional_tenant_link", column: "dek", id: p.envelope });
    try {
      const cifraP = (valor: string, coluna: string) => bytea(seal(Buffer.from(valor, "utf8"), dp.plaintext, columnAad("", "platform.professional", coluna, p.id)));
      linhas.push(
        `insert into platform.professional (id, display_name, council, council_uf, council_number, cpf_hmac, cpf_masked, cpf_enc, email_enc, email_hmac, dek_wrapped, kek_version, council_status) values (` +
          [texto(p.id), texto(p.nome), texto(p.conselho), texto(p.uf), texto(p.registro), bytea(cpfHmacWith(chaves.pepperCpf, cpf)), texto(maskCpf(cpf)),
            cifraP(cpf, "cpf_enc"), cifraP(p.email, "email_enc"), emailHmac, bytea(dp.wrapped.blob), dp.wrapped.kekVersion, "'nao_consultado'"].join(", ") +
          `) on conflict do nothing;`,
      );
      const conviteEnc = bytea(seal(Buffer.from(p.email, "utf8"), dv.plaintext, columnAad(p.clinica, "platform.professional_tenant_link", "invite_email_enc", p.envelope)));
      linhas.push(
        `insert into platform.professional_tenant_link (id, tenant_id, professional_id, invite_email_hmac, invite_email_enc, envelope_id, dek_wrapped, kek_version, propass_completed_at, privacy_notice_version, privacy_notice_ack_at) values (` +
          [texto(p.vinculo), texto(p.clinica), texto(p.id), emailHmac, conviteEnc, texto(p.envelope), bytea(dv.wrapped.blob), dv.wrapped.kekVersion, "now()", "'v1'", "now()"].join(", ") +
          `) on conflict do nothing;`,
      );
    } finally {
      dp.plaintext.fill(0);
      dv.plaintext.fill(0);
    }
  }
  return linhas.join("\n") + "\n";
}
