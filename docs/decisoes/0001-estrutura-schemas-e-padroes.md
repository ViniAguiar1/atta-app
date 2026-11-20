# ADR 0001: Estrutura do app, schemas (plataforma × produto) e padrões de base

- Status: proposta (Tech Lead, 20/11/2026), combinada com o Backend 1 no MIG-01
- Vale para: todas as trilhas do `ViniAguiar1/atta-app`
- Substitui, nesta stack: ADR 0001 (granularidade), 0002, 0003 e 0028 do `atta-platform`. As ADRs de domínio (0004–0007, 0011–0014, 0019–0026) continuam valendo como regra; muda só onde o dado mora.

## Contexto
Um Postgres só (Supabase), com o navegador falando direto com o banco pela Data API. A RLS é a única barreira no servidor. O PDD exige base única (§2.7, §11.1, §22.3, §29.5): o Clinic e o Pro precisam ler pessoa, consentimento, saúde, documentos assinados e auditoria **sem migrar dados**. Sete agentes vão escrever migrations e telas em paralelo a partir de amanhã; sem contrato comum, cada um inventa o seu.

## Decisão

### 1. Schemas
Identificadores de SQL e TypeScript em **inglês**, `snake_case` no banco (como o SQL do ENG-186 e os contratos `contracts/`). Texto de tela, docs, commits e PRs em português.

| Schema | Camada | Data API | Dono (trilha) | O que mora |
|---|---|---|---|---|
| `platform` | plataforma | exposto | BE1 | clínica (`tenant`, com a árvore Grupo → Unidade), membro e papel, profissional (sem login), convite, direito de uso por produto (`entitlement`), sessões |
| `network` | plataforma | **fechado** | BE2 (MIG-12) e BE3 (MIG-22) | BE2: pessoa por CPF (`cpf_hmac` + `cpf_enc`, ADR 0005 e ADR 0002 §6), verificação, vínculo pessoa × clínica, provisório de importação (ADR 0021), divergência. BE3: consentimento, Banco de Perguntas e definição do Formulário de Saúde |
| `health` | plataforma | **fechado** | BE3 (MIG-22) | respostas do Formulário de Saúde, cifradas na aplicação por envelope (ADR 0002); o banco só guarda texto cifrado |
| `documents` | plataforma | exposto | BE3 | modelos versionados, documento, assinatura (ATTA Sign), evidência, código de verificação, Pasta do Paciente: sem tabela própria, é a função `api.patient_folder` sobre `documents.document.folder_section` (`termos` \| `docs_clinicos`, PDD RN-FIC-05); a coluna é do BE3, e a função, do BE2 no MIG-12 |
| `audit` | plataforma | **fechado** | BE1 (MIG-04) | trilha append-only com hash encadeado; dono numa role sem login |
| `integrations` | plataforma | **fechado** | INT | credenciais e estado de provedores, webhooks recebidos, entregas (e-mail, WhatsApp, SMS, agenda) |
| `billing` | plataforma | **fechado** | INT (MIG-32) | assinatura da clínica no Asaas |
| `atta_in` | produto | exposto | BE2 | configurações em cascata, serviços, agenda, agendamento, link e QR, check-in, fila, pendências, notificações (regras), métricas, onboarding |
| `api` | borda | exposto | cada trilha | **só funções (RPC)** que tocam schema fechado; nenhuma tabela |
| `private` | interno | **fechado** | BE1 | funções auxiliares das policies (`current_tenant_id()`, `current_app_role()`...) |
| `public` | — | — | — | **vazio**. Nenhuma tabela; `CREATE` revogado |

Regras:
- **Dependência só de cima para baixo:** `atta_in` (e no futuro `clinic`, `pro`) referencia ids de plataforma; **nenhum schema de plataforma referencia `atta_in`**. Dado de rede nunca entra em `atta_in`; observação da clínica sobre o paciente fica em `atta_in` (ADR 0005 §2). É isso que deixa o Clinic e o Pro lerem sem migrar.
- O schema do produto leva o nome do produto (`atta_in`), não o do domínio. `clinic` e `pro` ficam reservados para o ATTA Clinic e o ATTA Pro; por isso nenhum schema se chama `clinica`. A passagem de produto é trocar `platform.entitlement` da mesma clínica.
- Profissional e PROpass são dado de plataforma (o Clinic e o Pro usam): `platform.professional` (global; conselho, UF e número únicos; CPF e contatos no padrão da pessoa: `cpf_hmac`, `cpf_masked`, `cpf_enc`, `phone_enc`, `email_enc`, com `getCofre('network')`) e `platform.professional_tenant_link`, escritos no MIG-14a/14b (BE2). Horários, Serviços autorizados e ausências do profissional são agenda do produto: ficam em `atta_in`.
- **Coluna sensível em schema exposto:** vai cifrada (ADR 0002) **e** fica fora do grant. `authenticated` recebe `SELECT` só nas colunas não sensíveis (grant por coluna), e o contato e o CPF mascarado saem por função em `api`, com auditoria. Vínculo pessoa × clínica (`network.person_tenant_link`, com `tenant_id` e RLS) e provisório ficam em `network`. O painel lê o paciente por funções em `api`, com campos fixos e CPF mascarado.
- Enum é `text` com `CHECK`, não `CREATE TYPE`. Valores em português `snake_case` quando já são contrato (`appointment_type.v1`).
- Schema fechado = fora de `[api] schemas` no `supabase/config.toml` e sem `USAGE` para `anon` e `authenticated`. **Exceção única: `private`** ganha `USAGE` para `authenticated` (MIG-02), porque a policy roda com os privilégios de quem consulta. `EXECUTE` vai só para as funções de policy (`current_tenant_id`, `current_app_role`, `has_permission`); as outras de `private` (ex.: `can_read_health`) não têm `EXECUTE` para `authenticated`. O schema continua fora da Data API. Só se chega nele por função em `api` (SECURITY DEFINER, `set search_path = ''`, `EXECUTE` revogado de `public` e `anon`, checagem de papel e de tenant dentro, registro em `audit` quando ler dado pessoal).
- A configuração de schemas expostos e do hook de token fica no `config.toml` versionado e vai para a nuvem com `supabase config push` (Backend 1). Nada à mão no painel.

### 2. Tabelas e RLS
- **Tenant = estabelecimento** (PDD §9.6 e Anexo B). A Unidade é uma conta completa, então é um `platform.tenant`, não outra tabela. A árvore (Conta, Grupo, Unidade; N níveis no modelo, 2 ativos, PDD §4.8) é `parent_tenant_id` em `platform.tenant`. O isolamento é sempre pela Unidade; a visão de Grupo e a herança de configuração (PDD §16.3) vêm depois, por função, sem mudar a policy.
- Toda tabela: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`; `updated_at` quando muda. Ids estáveis: nunca reusar nem trocar.
- Tabela de clínica: `tenant_id uuid not null references platform.tenant(id)`, índice começando por `tenant_id`.
- **Toda tabela, em todo schema: `ENABLE` e `FORCE ROW LEVEL SECURITY`**, inclusive as fechadas. Grants explícitos e mínimos por tabela (`REVOKE ALL` primeiro); nada de `GRANT ALL`.
- Policy canônica (porte do `atta_core/db/rls.py`): `tenant_id = (select private.current_tenant_id())`. Sem claim, a função devolve nulo e nenhuma linha passa (falha fechada). Papel por `(select private.current_app_role())`.
- Permissão por módulo (PDD §10.4.3, MIG-06): `private.has_permission(p_module text, p_action text) returns boolean`, com módulos `appointments`, `patients`, `documents`, `atta`, `metrics`, `settings`, `team` e `audit` e ações `view`, `create` e `edit`. ADMIN passa em tudo; `settings`, `team` e `audit` são só do ADMIN. Até o MIG-06, a função é um stub com essa regra e COLABORADOR liberado nos outros módulos. As policies e as funções já chamam por ela desde agora.
- `platform.tenant.timezone text not null default 'America/Sao_Paulo'` (MIG-02). Data local da clínica (`p_local_date`) é sempre interpretada nesse fuso.
- Função SECURITY DEFINER fora de `api` (ex.: a transição de estado em `atta_in`) segue as mesmas regras: `search_path = ''`, `EXECUTE` revogado de `public` e `anon`, e tenant e permissão conferidos dentro.
- Claims que o Custom Access Token Hook põe no token (MIG-03): `tenant_id` (clínica ativa) e `app_role` (`ADMIN` | `COLABORADOR`, PDD §10.4.3). **Nunca sobrescrever o claim `role`**, que é a role do Postgres. Entitlements não viajam no token (ADR 0012).
- Exclusão pelo usuário é lógica (`deleted_at timestamptz`, PDD §9.6); a eliminação definitiva é rotina própria e auditada (§19.9).
- O fluxo do paciente e o do profissional (check-in, ficha, Boarding Check; o profissional não faz login, PDD §10.4.3) **não usam tabela pela Data API**: passa pelo servidor do Next e por funções em `api` com o grant do link (ADR 0004/0019). `anon` não tem grant em tabela nenhuma.

### 3. Migrations, tipos e testes de banco
- `supabase/migrations/<timestamp>_<schema>_<slug>.sql`, criadas com `supabase migration new`. Uma migration por PR, sempre para a frente (não se edita migration que já entrou na `main`). Antes do merge, rebase: se a `main` ganhou migration mais nova que a sua, gere de novo o timestamp.
- `src/lib/supabase/database.types.ts` é gerado (`supabase gen types typescript --local`), nunca editado à mão, e entra no mesmo PR da migration. O CI falha se o arquivo gerado divergir.
- pgTAP em `supabase/tests/<schema>/<nn>_<slug>.test.sql`. Desde o MIG-01 o CI roda dois testes-portão: (a) nenhuma tabela fora de `pg_catalog`, `information_schema` e dos schemas do Supabase sem RLS ligada **e forçada**; (b) `public` sem tabela. O MIG-02 soma a matriz papel × tabela × operação e um terceiro portão: (c) toda view nos nossos schemas com `security_invoker = true` (view sem isso passa por cima da RLS) e nenhuma materialized view em schema exposto.
- Supabase local: `project_id = "atta-app"` e um bloco de portas fora do 54321–54327 (já ocupado nesta máquina por outro projeto). O README diz como cada agente sobe a sua instância sem colidir.
- `supabase/seed.sql`: só dado fictício (CPF e CNPJ gerados, nomes inventados).

### 4. Pastas do app
```
src/
  app/
    (clinica)/          painel da clínica
    (paciente)/         check-in, ficha, Boarding Check
    (publico)/          verificação pública
    api/health/route.ts página de saúde (status, versão, commit; sem banco)
  features/<modulo>/    agenda, configuracoes, pacientes, documentos, checkin...
    components/  actions.ts  queries.ts  schema.ts (Zod)  *.test.ts(x)
  components/ui/        componentes compartilhados entre (clinica), (paciente) e (publico) (dono: Frontend)
  styles/               globals.css → importa tailwindcss, tokens.css, tokens.theme.css (cópia do atta-platform/design/tokens, com o commit de origem no cabeçalho)
  lib/env.ts            variáveis públicas validadas com Zod · env.server.ts (secret key, `server-only`)
  lib/supabase/         client.ts (navegador) · server.ts (SSR, cookies) · admin.ts (secret key) · database.types.ts (gerado)
  lib/errors.ts         padrão de erro
  proxy.ts              renovação da sessão (MIG-01) e guardas de rota (MIG-03); o "middleware" do Next 16
supabase/  config.toml  migrations/  tests/  seed.sql
e2e/                    Playwright + axe
docs/decisoes/          ADRs curtas, numeradas
```
- Feature não importa de outra feature; o que é comum sobe para `components/` ou `lib/`.
- `lib/supabase/admin.ts` e `lib/env.server.ts` começam com `import 'server-only'` e o ESLint proíbe importá-los fora de `src/server/**`, `**/actions.ts` e `app/**/route.ts`. Toda chamada com a secret key confere o papel antes.

### 5. Erros, validação e logs
- Zod em toda borda (formulário, server action, route handler, resposta de RPC).
- Server action e route handler devolvem `{ ok: true, data } | { ok: false, error: { code, message, fields? } }`. `code` vem de uma lista fechada em `lib/errors.ts` (porte do padrão RFC 9457 do core); `message` em português, sem dado pessoal.
- Log sem CPF, nome, telefone, e-mail ou resposta de saúde. **`console.*` proibido pelo ESLint**; log só por `src/lib/logger.ts`, com o porte do scrubber do core.
- **Nada de dado pessoal em URL** (os logs do Supabase e da Vercel ficam na UE e nos EUA e guardam caminho e query string): CPF, nome de paciente, telefone, e-mail e dado de saúde nunca em segmento de rota, `searchParams` ou filtro da Data API. Filtro do supabase-js (`.eq`, `.ilike`, `.or`...) vai na query string, então busca por CPF ou nome só por `.rpc()` (POST, corpo; nunca `{ get: true }`) ou server action.
- Nenhuma migration ou config liga `log_statement`, `auto_explain` ou log de query lenta com valores.
- Checklist de revisão: `docs/checklist-revisao.md`.

### 6. Design: tokens e fontes
- Cores, fontes e tamanhos só pelos tokens. O `@theme` zera as cores, fontes e tamanhos genéricos do Tailwind (`--color-*: initial` etc.). Uma regra de lint (porte de `eslint-rules/cores.js`) reprova cor fora dos tokens, e um teste confere que o `@theme` zera as cores.
- Fontes por `next/font/google` (auto-hospedadas no build, sem pedido do navegador a outra origem; o e2e confere): Raleway (`--font-body`, 400/500/600), Prata (`--font-title`), Poppins (`--font-sub`); Montserrat e Allerta Stencil só quando uma tela usar. Subset latin + latin-ext, `display: swap`.
- Mudança de token é PR do Frontend, com o contraste conferido.

### 7. Ferramentas
Node 24 LTS, pnpm (lockfile versionado), TypeScript `strict` com `noUncheckedIndexedAccess`, ESLint, Vitest + Testing Library, Playwright + axe. Postgres local na mesma versão maior do projeto da nuvem (`major_version` no `config.toml`).

## Consequências
- Positivas: um contrato único para 7 trilhas; o Clinic e o Pro entram como mais um schema; schema fechado reduz o estrago de uma policy errada.
- Negativas: dado de rede e de saúde só por RPC (mais SQL e mais teste); migrations em paralelo exigem rebase com cuidado.
- Em aberto, em ADR própria: sessão do paciente (MIG-03/MIG-50), troca de clínica ativa para quem é membro de mais de uma. (Cofre e cifra: ADR 0002.)
