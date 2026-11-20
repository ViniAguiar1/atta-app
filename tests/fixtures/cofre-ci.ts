// KEK de TESTE, fictícia e pública (texto ASCII de 32 bytes), usada só no CI e nos testes. Produção a recusa.
export const CI_TEST_KEK_HEX = Buffer.from("atta-app-ci-kek-de-teste-ficticia", "ascii").subarray(0, 32).toString("hex");
export const CI_TEST_KEYRING = `k1:${CI_TEST_KEK_HEX}`;
