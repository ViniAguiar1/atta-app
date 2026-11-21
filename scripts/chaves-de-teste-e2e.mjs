// Chaves de TESTE do e2e, fictícias e PÚBLICAS, lidas das fixtures (tests/fixtures/cofre-ci.ts e selo-ci.ts) e escritas
// no $GITHUB_ENV do CI (ou num arquivo dado, no local). Nenhuma chave real passa por aqui: a prévia e a produção recusam
// todas pela impressão digital (getCofre, pepperFromEnv, chaveDoAmbiente). Nunca vira secret do GitHub nem .env versionado.
// O e2e do PROpass completo (MIG-55) precisa delas: cofre 'network' e 'documents', HMAC do CPF, pin_mac e o selo.
import { appendFileSync } from "node:fs";
import { CI_TEST_CPF_PEPPER_HEX, CI_TEST_KEYRING, CI_TEST_PIN_PEPPER_HEX } from "../tests/fixtures/cofre-ci.ts";
import { CI_TEST_SEAL_KID, CI_TEST_SEAL_PRIVATE_KEY } from "../tests/fixtures/selo-ci.ts";

const destino = process.argv[2] ?? process.env.GITHUB_ENV;
if (!destino) throw new Error("sem destino: rode no CI ($GITHUB_ENV) ou passe o arquivo");

const chaves = {
  ATTA_REDE_CHAVE_MESTRA: CI_TEST_KEYRING,
  ATTA_DOCUMENTOS_CHAVE_MESTRA: CI_TEST_KEYRING,
  ATTA_CPF_PEPPER: CI_TEST_CPF_PEPPER_HEX,
  ATTA_PIN_PEPPER: CI_TEST_PIN_PEPPER_HEX,
  ATTA_SEAL_KID: CI_TEST_SEAL_KID,
  ATTA_SEAL_PRIVATE_KEY: CI_TEST_SEAL_PRIVATE_KEY,
};
// Formato de várias linhas do $GITHUB_ENV (a chave PEM tem quebras de linha).
const texto = Object.entries(chaves).map(([nome, valor]) => `${nome}<<FIM_DA_CHAVE\n${valor.trim()}\nFIM_DA_CHAVE\n`).join("");
appendFileSync(destino, texto);
console.log(`chaves de teste do e2e: ${Object.keys(chaves).join(", ")}`); // só os nomes, nunca os valores
