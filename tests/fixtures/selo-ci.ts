// Chave de selo de TESTE do ATTA Sign (Ed25519), fictícia e PÚBLICA (o repo é público): só para o CI, o local e o e2e do
// PROpass (pedido do Frontend 6; contrato do Tech Lead, 21/11). Não assina nada que valha. A pública entra em
// documents.seal_key só pelo supabase/seed.sql; nunca por migration nem por scripts/seed-nuvem. O servidor a recusa na
// nuvem (prévia e produção), pela impressão digital da SPKI e pelo prefixo do kid (chaveDoAmbiente, termo-autorizacao.ts);
// src/server/atta-sign/selo-de-teste.test.ts prova as travas e a varredura.
// O kid é "staging-seal-ci-teste" (e não "ci-seal-teste"): o CHECK de documents.seal_key só aceita "staging-seal-" ou
// "seal-", e o prefixo "staging-" também é recusado na nuvem.
export const CI_TEST_SEAL_KID = "staging-seal-ci-teste";
export const CI_TEST_SEAL_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIKTjSVLgTRpCX/GLAUtlXFmBPScUqT9p7Q4tDZs9qwEC
-----END PRIVATE KEY-----
`;
export const CI_TEST_SEAL_PUBLIC_SPKI_HEX = "302a300506032b6570032100985fbf55b622f0072959e4d53a9c52d0729b6dc42027c153db8b90ecfea96834";
export const CI_TEST_SEAL_FINGERPRINT = "6fe9f4faa452e7824940aa01aaae15b4d1397df75d1eee2e8e04b15e927a4850"; // sha256 da SPKI DER
