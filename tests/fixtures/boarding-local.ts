// Boarding Check FICTÍCIO do supabase/seed.sql, para o e2e contra o banco no CI e o `pnpm dev` (MIG-23 parte 3b; no molde
// do convite do PROpass, #264). O repositório é público, então o segredo do link e o PIN são CONHECIDOS e valem só no
// Supabase local e no do CI. Duas travas impedem que valham na nuvem (src/server/boarding/seed-local.test.ts):
//   1. o segredo e o sha256 dele só aparecem neste arquivo e no supabase/seed.sql (nunca em scripts/seed-nuvem nem numa
//      migration), e o seed.sql só roda no `db reset` local (o `db push` da nuvem não roda seed);
//   2. o pin_mac do seed foi calculado com o pepper de TESTE do PIN, que a prévia e a produção recusam (pepperFromEnv):
//      com o pepper da Vercel, o mesmo PIN dá outro mac, e o banco o conta como erro.
// O link vale 8 h a partir do `db reset` (RN-FIC-07; o seed o dá como enviado na hora). O PIN certo consome o link: um
// fluxo completo por `db reset`.

/** 32 bytes ASCII em base64url, no formato do gerarSegredo. */
export const BOARDING_LOCAL_SEGREDO = Buffer.from("atta-e2e-boarding-seed-localonly", "ascii").toString("base64url");
/** PIN de teste da profissional do seed; não é óbvio (validarPin) e nunca aparece na tela. */
export const BOARDING_LOCAL_PIN = "7314";
/** Clínica Alfa Estética, profissional Dra. Renata Albuquerque e o vínculo dela (seed do MIG-11). */
export const BOARDING_LOCAL_CLINICA = "eeee0000-0000-4000-8000-000000000001";
export const BOARDING_LOCAL_PROFISSIONAL = "eeee0000-0000-4000-8000-000000000301";
export const BOARDING_LOCAL_VINCULO = "eeee0000-0000-4000-8000-000000000311";
/** Consulta de AMANHÃ às 10:00 (fuso da clínica), Pronto, da paciente Carla Siqueira (nome social): fora de "Hoje",
 * para não mexer nos números do e2e da Agenda. */
export const BOARDING_LOCAL_ATENDIMENTO = "eeee0000-0000-4000-8000-000000000509";
