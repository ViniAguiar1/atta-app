# ADR 0002: Interface `Cofre` e cifra por envelope na aplicação (Formulário de Saúde e outros campos sensíveis)

- Status: aceita (Tech Lead, 20/11/2026), a partir das decisões do CTO de 20/11 (PLANO, MIG-22). Regra do dono: nenhum serviço além de Supabase, Vercel e GitHub
- Implementa: Backend 3 (MIG-22). Espaço no esqueleto: Backend 1 (MIG-01). Revisão: Tech Lead obrigatório
- Substitui, nesta stack: o chaveiro sobre `data_key` do `atta_core.crypto` (ADR 0017 item 4). O formato 1 do valor cifrado continua o mesmo

## Contexto
A resposta de saúde é cifrada **na aplicação**, por envelope: cada registro tem uma chave de dados própria (DEK, AES-256-GCM), envelopada por uma chave mestra (KEK) que **não mora no Supabase**. O Vault do Supabase fica fora, porque o admin do banco lê `vault.decrypted_secrets` e a chave raiz sai pela Management API. Sem serviço externo, a KEK fica numa **variável sensível da Vercel**, lida só no servidor. O `atta-core` já tem o formato 1 e os vetores `crypto_v1`, que não podem mudar.

## Decisão

### 1. Chave mestra
- Variáveis `ATTA_SAUDE_CHAVE_MESTRA`, `ATTA_DOCUMENTOS_CHAVE_MESTRA` e `ATTA_REDE_CHAVE_MESTRA`, sensíveis, cadastradas pelo CTO (gerada sem passar por chat). Valores **diferentes** em Production e em Preview; em Development, nenhum valor na Vercel.
- O formato é um chaveiro com versão, `k<n>:<64 hex>`, com as entradas separadas por vírgula. A primeira entrada é a ativa, e as outras só abrem registros antigos. Exemplo de forma: `k2:<hex>,k1:<hex>`.
- Testes: `vitest.config` com alias de `server-only` para um módulo vazio; a KEK do CI fica em `tests/fixtures/cofre-ci.ts`.
- **Procedimento de chaves (decisão do dono, 20/11):**
  - Geração: o CTO gera cada chaveiro e pepper neste Mac, com gerador criptográfico (`openssl rand -hex 32`), direto num arquivo do cofre do OpenBot. O valor nunca passa por chat, terminal compartilhado, commit ou arquivo fora do cofre.
  - Cadastro: o CTO lê o valor do cofre e cadastra na Vercel como variável sensível quando a trilha pedir, com um valor para Production e outro para Preview.
  - Cópia: o dono guarda a segunda cópia de cada valor de Production, fora do Mac e da Vercel. Sem essa cópia, nenhum dado real é gravado.
  - Rotação: o CTO gera `k<n+1>`, guarda no cofre, entrega a cópia ao dono e põe a versão nova na frente na Vercel, mantendo as antigas. Um job reenvelopa as DEKs (o dado não muda). Ao terminar, a versão antiga sai da variável, mas continua no cofre e na cópia do dono até o fim da retenção dos backups do banco.
  - Pepper não se rotaciona por troca simples: mudar o pepper muda todos os `cpf_hmac`. Troca só por job que recalcula a partir do `cpf_enc`, com decisão do CTO.
  - Vazamento suspeito: rotação imediata e registro do incidente (PDD §19.10).
- Dev local: chave fictícia no `.env.local`, no mesmo formato. No CI, um valor de teste fixo. Em produção, `getCofre()` recusa a chave de teste do CI, comparando a impressão digital.

### 2. Interface (`src/server/cofre/`, só servidor, runtime Node)
```ts
// src/server/cofre/types.ts
import 'server-only';

/** Liga a chave ao lugar onde ela é usada; entra na AAD do envelope. */
export type CofreContext = Readonly<{
  tenant_id: string;   // '' para dado de rede (sem tenant)
  table: string;       // 'health.answer'
  column: string;      // 'value'
  id: string;          // id da linha
}>;

export type WrappedKey = Readonly<{
  kekVersion: number;  // n de k<n>; gravado na linha
  blob: Uint8Array;    // DEK envelopada (contêiner do formato 1)
}>;

export interface Cofre {
  /** DEK nova de 32 bytes: em claro (só em memória) e envelopada pela KEK ativa. */
  generateDataKey(ctx: CofreContext): Promise<{ plaintext: Uint8Array; wrapped: WrappedKey }>;
  /** Abre uma DEK guardada com a KEK da versão gravada; o contexto precisa ser idêntico. */
  unwrapDataKey(wrapped: WrappedKey, ctx: CofreContext): Promise<Uint8Array>;
}
```
- `src/server/cofre/index.ts` exporta `getCofre(purpose: 'health' | 'documents' | 'network'): Cofre`, que lê e valida o chaveiro uma vez por processo. Chave ausente ou malformada derruba o boot com erro claro, sem mostrar o valor.
- O envelope da DEK usa o contêiner `dek_wrapped` do formato 1 (AES-256-GCM), com a **versão da KEK** no cabeçalho e a AAD `atta_core.crypto.data_key|tenant_id|table|column|id`. O vetor `crypto_v1/dek_wrapped.json` (AAD só com o tenant) prova o contêiner, não o Cofre; o Cofre tem testes próprios de ida e volta, de AAD trocada e de versão errada.
- Na AAD, `table` é `schema.tabela` (`[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*`). É uma regra nova no porte para TS; os vetores não mudam.
- Três chaveiros, um por finalidade, para limitar o estrago de um vazamento, todos com o mesmo formato e a mesma interface:
  - `getCofre('health')` lê `ATTA_SAUDE_CHAVE_MESTRA`;
  - `getCofre('documents')` lê `ATTA_DOCUMENTOS_CHAVE_MESTRA` (os PDFs e objetos do Storage, ADR 0026);
  - `getCofre('network')` lê `ATTA_REDE_CHAVE_MESTRA` (`cpf_enc`, `rne_enc`, `phone_enc` e `email_enc` de `network.person`).
- A interface fica estável: se um dia houver KMS, entra outra implementação de `Cofre` sem mexer no resto.

### 3. Cifra do valor (`src/server/crypto/envelope.ts`)
- `seal(plaintext, dek, aad)` e `open(value, dek, aad)` no **formato 1**: `0x01 ‖ key_version uint16 BE ‖ nonce 12 ‖ cifrado ‖ tag 16`, com o cabeçalho na AAD. AAD = `tenant_id|table|column|id`. Precisa decifrar byte a byte o `crypto_v1/envelope.json`.
- Com DEK por registro, o `key_version` do valor fica em `1`. A versão que importa é a da KEK, gravada na linha.
- Toda falha vira um erro só (`CRYPTO_FAILED`), sem dizer se foi tag, AAD ou chave.

### 4. Onde fica no banco
- Na linha cifrada (ex.: `health.answer`): `value_enc bytea` (formato 1), `dek_wrapped bytea` e `kek_version smallint`. Nada em claro, nem a DEK.
- PDF e objeto do Storage: cifrados antes do upload, com o contexto `(tenant_id, 'documents.stored_object', 'content', id)`. A DEK envelopada e a `kek_version` ficam na linha de `documents.stored_object` (ou em uma tabela filha só de inserção, ADR 0026). O Storage só recebe bytes cifrados.
- O selo Ed25519 do ATTA Sign não passa pelo Cofre. A chave privada fica em variável sensível própria da Vercel, só no servidor.
- O banco **não decifra nunca**: nada de pgcrypto com chave e nada de Vault do Supabase para isso.

### 5. Caminho de leitura (dupla barreira)
- **Quem pode ler fica num lugar só:** `private.can_read_health(p_person_id uuid, p_context jsonb) returns boolean` (SECURITY DEFINER, `search_path = ''`, só chamada pelas funções de `api`). Toda função que devolve resposta de saúde chama essa e nenhuma outra checagem. Ela libera o próprio paciente (grant `patient_checkin`) e o profissional com grant `professional_boarding` válido (`private.grant_is_valid`) do atendimento daquele paciente, só para leitura (ADR 0004 §3; PDD v206 §10.2.3; alinhamento da PO de 20/11). Todo o resto é negado. A validade e a revogação do link e do PIN estão em aberto com a PO e mudam só em `private.grant_is_valid`. Gestor e Colaborador nunca passam, qualquer que seja a regra.
1. O servidor do Next chama a função em `api` (SECURITY DEFINER). Ela confere a autorização ativa do profissional ou se é o próprio paciente, **grava o acesso em `audit`** e só então devolve os bytes cifrados.
2. O servidor abre a DEK no `Cofre`, decifra em memória e responde.
- A DEK fica só no escopo da requisição: zerada depois do uso (`fill(0)`), nunca em cache, log ou resposta. A KEK nunca sai do módulo `cofre`.
- Rotas que usam o `Cofre` declaram `export const runtime = 'nodejs'`.

## Consequências
- Um dump do banco, o admin do Supabase ou uma policy errada só entregam texto cifrado.
- **Limite:** quem tiver ao mesmo tempo acesso à Vercel do projeto (variável sensível) e ao banco consegue decifrar. O acesso à Vercel precisa ser restrito, e a rotação, praticada.
- Perder a variável é perder os dados. Por isso existem o cofre do OpenBot e a cópia do dono (seção 1).
- Também são segredos de servidor, fora do banco: os peppers do `cpf_hmac` e do `rne_hmac` (`ATTA_CPF_PEPPER`, `ATTA_RNE_PEPPER`).

### 6. CPF e contato (dado de rede)
- `src/server/crypto/cpf.ts` (só servidor): `normalizeCpf`, `isValidCpf`, `cpfHmac(cpf)` (HMAC-SHA256 com `ATTA_CPF_PEPPER`, que precisa bater com `crypto_v1/hmac_cpf.json`) e `maskCpf(cpf)`. O RNE tem as funções equivalentes, com pepper próprio (`ATTA_RNE_PEPPER`).
- **O banco não calcula HMAC, não cifra e não mascara.** A server action normaliza, calcula `cpf_hmac`, cifra `cpf_enc`, `phone_enc` e `email_enc` com `getCofre('network')`, gera `cpf_masked` e só então chama a função em `api`, com a sessão do usuário (nunca a secret key), para que tenant, papel e auditoria sejam conferidos no banco.
- A busca por CPF manda `p_cpf_hmac bytea`, nunca o CPF. A busca por nome usa `full_name` em claro, só entre os pacientes vinculados à clínica.
- Pepper e chaveiro de rede são de plataforma, compartilhados pelo Backend 2 (paciente) e pelo Backend 3 (saúde e documentos). O dono do módulo é o Backend 3.
- **Outro uso do `ATTA_CPF_PEPPER`: a chave do limitador de tentativas** (`src/server/limite.ts`, ADR 0004 §2), HMAC-SHA256 com o rótulo `atta.ratelimit.v1|<bucket>|<valor>`. O rótulo separa esse domínio do `cpf_hmac` e do `emailHmac`. Trocar o pepper aqui só zera contadores de janela curta e não pede job de recálculo.
