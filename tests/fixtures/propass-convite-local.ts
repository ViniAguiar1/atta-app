// Convite de PROpass FICTÍCIO do supabase/seed.sql, para o e2e do fluxo completo no CI e o `pnpm dev` (pedido do
// Frontend 6; regra do CTO, 21/11). O repositório é público, então este segredo é CONHECIDO e vale só no Supabase local
// e no do CI. Duas travas impedem que ele valha na nuvem (src/server/propass/seed-local.test.ts):
//   1. o segredo e o sha256 dele só aparecem neste arquivo e no supabase/seed.sql (nunca em scripts/seed-nuvem nem numa
//      migration), e o seed.sql só roda no `db reset` local (o `db push` da nuvem não roda seed);
//   2. o e-mail do convite está cifrado com a KEK de TESTE do CI, que a prévia e a produção recusam (getCofre): mesmo
//      aplicado por engano num banco da nuvem, o link não abre lá.
// Na prévia e na produção, o convite do teste de ponta a ponta sai só do script operacional (scripts/seed-nuvem/
// convite-propass.ts, que o Backend 1 roda), com validade curta e uso único.
// O link é de uso único: um envio completo por `db reset`. Vale 7 dias (política do grant) a partir do reset.

/** 32 bytes ASCII em base64url, no formato do gerarSegredo. */
export const PROPASS_LOCAL_SEGREDO = Buffer.from("atta-e2e-propass-seed-local-only", "ascii").toString("base64url");
export const PROPASS_LOCAL_EMAIL = "convite.propass.ficticio@exemplo.test";
/** Clínica Alfa Estética do seed (razão social e CNPJ fictícios, para o Termo de Autorização). */
export const PROPASS_LOCAL_CLINICA = "eeee0000-0000-4000-8000-000000000001";
export const PROPASS_LOCAL_VINCULO = "eeee0000-0000-4000-8000-000000000321";
export const PROPASS_LOCAL_ENVELOPE = "eeee0000-0000-4000-8000-000000000322";
