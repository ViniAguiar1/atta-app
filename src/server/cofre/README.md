# cofre

Cifra por envelope (ADR 0002, `docs/decisoes/0002-cofre-e-cifra-por-envelope.md`), dono Backend 3.

- `index.ts`: `getCofre('health' | 'documents' | 'network')`, um chaveiro por domínio (`ATTA_SAUDE_CHAVE_MESTRA`,
  `ATTA_DOCUMENTOS_CHAVE_MESTRA`, `ATTA_REDE_CHAVE_MESTRA`). Produção recusa a KEK de teste do CI.
- `master-key.ts`: chaveiro `k<n>:<64 hex>` (a primeira entrada é a ativa), DEK no contêiner formato 1 com a versão da KEK
  no cabeçalho e AAD `atta_core.crypto.data_key|tenant_id|schema.tabela|coluna|id`.
- `types.ts`: a interface `Cofre` (`generateDataKey`, `unwrapDataKey`).
- A cifra do valor fica em `src/server/crypto/envelope.ts` (`seal`/`open`, formato 1, vetores `crypto_v1`).

Só servidor, runtime Node (`export const runtime = 'nodejs'` em quem usa). A DEK em claro é zerada (`fill(0)`) depois do uso.
