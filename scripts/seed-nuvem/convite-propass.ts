import type { Cofre } from "@/server/cofre";
import { emailHmacWith } from "@/server/crypto/email";
import { hashDoSegredo } from "@/server/grant/politica";
import { selarConvite } from "@/server/propass/convite";
import { AURORA } from "./profissionais";

// Convite de PROpass FICTÍCIO na nuvem, para o QA 2 validar a verificação pública (#221) e o Backend 4 fazer o envio de
// ponta a ponta (pedido do Tech Lead). Exceção operacional da R31, aprovada pelo CTO (ADR 0006): um e-mail @exemplo.test
// não recebe o convite, então o link vai para um arquivo do QA, nunca para a clínica. Travas (Tech Lead e Backend 1):
//   - só na clínica fictícia Aurora e só com e-mail @exemplo.test (o código recusa outra coisa);
//   - nenhum e-mail sai e nenhuma conta de pessoa é usada: o SQL roda como dono do banco (Backend 1, psql), cria o
//     vínculo e emite o link pela private.propass_issue, a mesma do convite do painel, com a validade e o uso único da
//     política do grant (7 dias; consumido no envio), sem estender nada. A trilha registra o convite como do sistema;
//   - o banco recebe só o sha256 do segredo; o link sai daqui só para o arquivo do QA (modo 600), nunca para o stdout;
//   - idempotente: o mesmo número reemite o link (a private.propass_issue revoga o anterior); convite já concluído é
//     recusado, e roda-se com outro número.
// Envelope do convite pela ADR 0001 §1 e 0002 §6, pelo selarConvite do app.

export const DOMINIO_DE_TESTE = "@exemplo.test";

/** Vínculo e envelope fixos por número, fora das faixas do seed da agenda (#176). */
export function idsDoConvite(numero: number) {
  if (!Number.isInteger(numero) || numero < 1 || numero > 49) throw new RangeError("número do convite de 1 a 49");
  const uuid = (n: number) => `0a770000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
  return { vinculo: uuid(900 + numero), envelope: uuid(950 + numero), email: `propass.teste.${numero}${DOMINIO_DE_TESTE}` };
}

export type ConviteGerado = { sql: string; link: string };

export async function gerarConvite(entrada: {
  cofre: Cofre;
  pepperCpf: Uint8Array;
  numero: number;
  segredo: string;
  baseUrl: string;
  clinica?: string;
}): Promise<ConviteGerado> {
  const clinica = entrada.clinica ?? AURORA;
  if (clinica !== AURORA) throw new Error("o convite de teste só vale na clínica fictícia Aurora");
  if (!/^https:\/\/[a-z0-9.-]+$/.test(entrada.baseUrl)) throw new Error("base da URL fora do formato (https, sem caminho)");
  const { vinculo, envelope, email } = idsDoConvite(entrada.numero);
  if (!email.endsWith(DOMINIO_DE_TESTE)) throw new Error("o convite de teste só vai para @exemplo.test");
  const hash = hashDoSegredo(entrada.segredo);
  if (!hash) throw new Error("segredo fora do formato");

  const c = await selarConvite(
    { tenantId: clinica, email, envelopeId: envelope },
    { cofre: entrada.cofre, hmacDoEmail: (e) => emailHmacWith(entrada.pepperCpf, e) },
  );
  const bytea = (v: string) => `'${v}'::bytea`;
  const sql = `-- Convite de PROpass FICTÍCIO (scripts/seed-nuvem/convite-propass.ts). Só bytes cifrados, HMAC e o sha256 do
-- segredo: nenhuma chave, nenhum link. Rodar como dono do banco, numa transação, e apagar o arquivo em seguida.
begin;
do $$
begin
  if exists (select 1 from platform.professional_tenant_link l
             where l.id = '${vinculo}' and l.professional_id is not null) then
    raise exception 'convite ${entrada.numero} já concluído: rode com outro número';
  end if;
  insert into platform.professional_tenant_link (id, tenant_id, invite_email_hmac, invite_email_enc, envelope_id,
                                                 dek_wrapped, kek_version)
  values ('${vinculo}', '${clinica}', ${bytea(c.invite_email_hmac)}, ${bytea(c.invite_email_enc)}, '${c.envelope_id}',
          ${bytea(c.dek_wrapped)}, ${c.kek_version})
  on conflict (id) do update set invite_email_hmac = excluded.invite_email_hmac, invite_email_enc = excluded.invite_email_enc,
    envelope_id = excluded.envelope_id, dek_wrapped = excluded.dek_wrapped, kek_version = excluded.kek_version,
    deleted_at = null, updated_at = now()
  where platform.professional_tenant_link.professional_id is null;
  perform private.propass_issue('${clinica}', '${vinculo}', ${bytea(`\\x${hash.toString("hex")}`)});
  perform audit.record_event('professional.invite', 'platform.professional_tenant_link', '${vinculo}',
    '{"via": "seed_teste"}', null, null, '${clinica}');
end $$;
commit;
`;
  return { sql, link: `${entrada.baseUrl}/propass/${entrada.segredo}` };
}
