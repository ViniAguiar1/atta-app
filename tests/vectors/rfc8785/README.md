# Vetores do RFC 8785 (JCS)

Vetores de terceiros que prendem o `atta_core.crypto.canonicalizar_json` ao RFC 8785, como o ADR 0006 §2 exige
("um terceiro precisa reproduzir o hash com uma biblioteca padrão"). Nenhum arquivo aqui foi escrito por nós.

| Arquivo | Origem | O que prova |
| :-- | :-- | :-- |
| `input/*.json`, `output/*.json`, `outhex/*.txt` | `testdata/` do repositório do autor do RFC, github.com/cyberphone/json-canonicalization, commit `dc406ce` (2021-08-23), Apache 2.0 | `input/x.json` canonicalizado é byte a byte `output/x.json`; `outhex/x.txt` é a mesma saída em hexadecimal, para pegar editor que altere o `output` |
| `apendice-b-numeros.txt` | Tabela 1 do Apêndice B do RFC 8785, no formato `hex-ieee,esperado` | serialização de número no formato do ES6, inclusive bordas (`1e+21`, `0.000001`, arredondamento par); linha sem esperado (NaN, Infinity) é erro |
| `es6testfile-amostra.txt` | linhas de amostra do `README.md` do `testdata/` acima (o arquivo completo tem 100 milhões de linhas) | o mesmo formato, fora do RFC |

Teste: `tests/vectors/test_jcs_vectors.py`. Os arquivos são cópia fiel da fonte; se a fonte mudar, isto aqui não muda
(o RFC é fixo). Novo vetor entra como arquivo novo.
