# Vetores do formato 1 de `atta_core.crypto` (envelope, `dek_wrapped` e HMAC de CPF) — imutáveis

Trava de regressão do dado em repouso (02 §8.6; ADR 0017 item 4; RFC-0003 §4). O que estiver gravado com este
formato em 08/03/2027 precisa decifrar em 2047, então o formato não muda: mudança nasce como formato 2, pelo primeiro
byte do valor, com vetores novos ao lado e os destes intactos.

| Arquivo | O que prende |
| :-- | :-- |
| `envelope.json` | um valor de coluna no formato 1 (`0x01 ‖ key_version uint16 BE ‖ nonce 12 ‖ cifrado ‖ tag 16`), a DEK, e a AAD `tenant_id\|tabela\|coluna\|id` com o cabeçalho de 3 bytes na frente dentro do GCM; o teste decifra e confere o claro e a `key_version` lida |
| `dek_wrapped.json` | a mesma DEK envelopada por uma KEK com a AAD `atta_core.crypto.data_key\|tenant_id` e a versão da DEK no cabeçalho |
| `hmac_cpf.json` | HMAC-SHA256 de três CPFs sintéticos de dígito verificador inválido (11 dígitos; org/10 §4.1) com um pepper fixo |

Cifra com nonce aleatório não tem vetor de ida: o vetor é de **volta** (decifra), que é o que prende o formato.
Todo segredo aqui é sintético e de baixa entropia (texto ASCII de 32 bytes em hex); nenhum vale fora deste teste.

**Estes arquivos não mudam.** O job `vectors-immutable` (`.github/workflows/hash-vectors.yml`) barra modificação e
remoção dos dados e do teste `../test_crypto_v1.py` que os lê (este README fica de fora); `tests/vectors/**` é área
protegida (06 §5.6).

Como os esperados nasceram (12/10/2026, ATIN-52): gerados por `atta_core.crypto` e conferidos de forma independente
antes de congelar: HMAC pelo `openssl dgst -sha256 -mac HMAC`; envelope e `dek_wrapped` pelo
`crypto.createDecipheriv("aes-256-gcm")` do Node 24, montando a AAD como `cabeçalho ‖ aad`. Os três bateram.
Antes do primeiro push (19/10/2026) o `hmac_cpf.json` e o claro do `envelope.json` foram refeitos com CPFs de dígito
verificador inválido, que nunca são um CPF possível, e reconferidos da mesma forma; o `dek_wrapped.json` não mudou.
