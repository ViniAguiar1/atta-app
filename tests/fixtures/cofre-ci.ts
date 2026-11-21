// KEK de TESTE, fictícia e pública (texto ASCII de 32 bytes), usada só no CI e nos testes. Produção a recusa.
export const CI_TEST_KEK_HEX = Buffer.from("atta-app-ci-kek-de-teste-ficticia", "ascii").subarray(0, 32).toString("hex");
export const CI_TEST_KEYRING = `k1:${CI_TEST_KEK_HEX}`;

// Peppers de TESTE do HMAC de documento (ATTA_CPF_PEPPER e ATTA_RNE_PEPPER), fictícios e públicos, só do CI, do local e
// do seed (supabase/seed.sql, MIG-43). Produção e prévia usam os da Vercel, que nunca passam por aqui.
export const CI_TEST_CPF_PEPPER_HEX = Buffer.from("atta-app-ci-pepper-do-cpf-ficticio-000", "ascii").subarray(0, 32).toString("hex");
export const CI_TEST_RNE_PEPPER_HEX = Buffer.from("atta-app-ci-pepper-do-rne-ficticio-000", "ascii").subarray(0, 32).toString("hex");

// Pepper de TESTE do PIN do Boarding Check (ATTA_PIN_PEPPER; MIG-14b), fictício e público, só do CI e do local.
export const CI_TEST_PIN_PEPPER_HEX = Buffer.from("atta-app-ci-pepper-do-pin-ficticio-000", "ascii").subarray(0, 32).toString("hex");
