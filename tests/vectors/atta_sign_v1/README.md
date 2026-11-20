# Vetores de `atta_sign_version: 1` — imutáveis

Trava de regressão do hash do ATTA Sign, camada 1 (06 §6.3; ADR 0006 item 10). Três documentos sintéticos, cada
um com:

| Arquivo | Conteúdo |
| :-- | :-- |
| `payload.json` | o payload de entrada, escrito à mão, em NFC, na forma da tabela v1 da RFC-0017 §4.2 (D-3 e D-4: `identity_document`, `capacity`, `acting_for`, `signer`, datas com milissegundos, só inteiros) sobre a estrutura do ADR 0006 §3 com as erratas de 29/09 |
| `canonical.txt` | `JCS(payload)`, byte a byte, sem quebra de linha ao fim |
| `evidence_sha256.txt` | `SHA-256(canonical)` em hex minúsculo |
| `atta_code.txt` | o Código ATTA derivado: `ATTA-` + 12 símbolos Crockford dos 60 bits mais significativos, sem símbolo de verificação (RFC-0020 D-1) |

Casos: `caso-01` só o paciente assina; `caso-02` paciente, profissional executor e responsável técnico, com a
segunda tentativa de Código ATTA (`extensions.code_nonce: 1`, ADR 0006 §5, que entra no hash); `caso-03`
assinatura assistida, IPv6 e nomes acentuados em NFC (`ç`, `ã`, `ê`, `ü`, `ô`, apóstrofo), o erro que aparece tarde.
Todo dado é sintético: CNPJs e CPFs mascarados inventados, IPs de documentação (RFC 5737 e 3849), UUIDs fixos.
Nenhum caso tem número fracionário: o esquema v1 só tem inteiros (RFC-0017 D-4); o formato de float do JCS fica
preso pelos vetores do RFC em `../rfc8785/` e pelo teste unitário, não por estes.

**Estes arquivos não mudam.** O job `vectors-immutable` (`.github/workflows/hash-vectors.yml`) barra modificação
e remoção desde a base, dos dados e do teste `../test_atta_sign_v1.py` que os lê (este README fica de fora); `tests/vectors/**` é área protegida (06 §5.6). Mudança de cálculo nasce como
`atta_sign_version: 2` em `tests/vectors/atta_sign_v2/`, com a versão 1 intacta e verificável para sempre.

Como os esperados nasceram (12/10/2026, ATIN-51): gerados por `atta_core.crypto` e conferidos de forma
independente antes de congelar, com o canonicalizador do Apêndice A do RFC 8785 rodando no Node 24, o SHA-256 do
Node e uma reimplementação do Crockford em BigInt. Os três bateram byte a byte.

Premissa registrada: os vetores prendem o **algoritmo** (JCS, SHA-256, Crockford), não o esquema do payload. O
esquema v1 congela no DOC-009 (23/11/2026) a partir da RFC-0017, ainda em rascunho quando estes casos nasceram; se
um nome de campo mudar, estes três continuam vetores válidos do cálculo, e os casos 04 (RNE) e 05 (reservas
preenchidas) do DOC-022 entram ao lado, com a cópia espelhada em `atta-docs/tests/vectors/`.
