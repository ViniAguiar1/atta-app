# atta-app

Plataforma ATTA em Next.js + Supabase: painel da clínica, fluxo do paciente, verificação pública e as migrations do
banco. Arquitetura, schemas e padrões: [`docs/decisoes/`](docs/decisoes/) (comece pela ADR 0001). Checklist de
revisão: [`docs/checklist-revisao.md`](docs/checklist-revisao.md).

**Dados: só fictícios.** Nunca dado real de paciente, profissional ou clínica; só CPF e CNPJ gerados para teste e
nomes inventados, também em print, log, PR e seed.

## Fluxo (fase de migração)
- Branch `tipo/MIG-<n>-slug` a partir da `main`; commit `tipo(escopo): resumo [MIG-<n>]`; PR para a `main`.
- Merge **squash**, pelo autor, com o ✅ do revisor indicado, o CI verde e a prévia da Vercel abrindo. Em segurança,
  auth, RLS, saúde, auditoria ou assinatura, também o ✅ do Tech Lead.
- PR pequeno (até ~400 linhas úteis); trabalho grande em PRs empilhados. Rode lint, typecheck e testes antes do push:
  a cota do Actions é da conta pessoal do dono.
- Todo PR termina com `Autor: <nome> · Revisor: <nome> · QA: <nome ou —>`.

## Requisitos
Node 24 (`.nvmrc`), pnpm (versão no `packageManager`), Docker e o CLI do Supabase
(`brew install supabase/tap/supabase`).

## Supabase local: uma instância por agente
Os agentes dividem a mesma máquina, e as portas padrão do Supabase (54321–54327) já são de outro projeto. Por isso,
**cada um sobe a sua instância pelo script, com a sua sigla**. O script passa ao CLI um `project_id` e um bloco de
portas próprios por variável de ambiente; o `supabase/config.toml` versionado não muda.

| Sigla | API | Banco | App (`pnpm dev --port`) |
| :-- | :-- | :-- | :-- |
| (CI) | 43321 | 43322 | 3000 |
| BE1 | 43421 | 43422 | 3001 |
| BE2 | 43521 | 43522 | 3002 |
| BE3 | 43621 | 43622 | 3003 |
| INT | 43721 | 43722 | 3004 |
| FE | 43821 | 43822 | 3005 |
| FE2 | 43921 | 43922 | 3006 |
| TL | 44021 | 44022 | 3007 |
| QA | 44121 | 44122 | 3008 |

```bash
export ATTA_SIGLA=BE1                 # a sua
pnpm db start                         # sobe leve (sem Studio, logs, Edge Runtime nem imgproxy); ATTA_SUPABASE_COMPLETO=1 para tudo
pnpm db env > .env.local              # URL e chaves LOCAIS desta instância (o .env.local fica fora do git)
pnpm db reset                         # recria o banco local com as migrations e o seed
pnpm db test                          # pgTAP (supabase/tests)
pnpm db types > src/lib/supabase/database.types.ts   # tipos gerados; o CI reprova se divergirem
pnpm db stop                          # para sem apagar os dados
```
Nunca use a base local de outro agente sem combinar.

## App
```bash
pnpm install
pnpm dev --port 3001                  # a porta da sua sigla
pnpm lint && pnpm typecheck && pnpm test
pnpm build && PORT=3001 pnpm test:e2e # Playwright + axe
```
Saúde: `GET /api/health` (status, serviço, commit; sem banco).

## Banco
- Migrations em `supabase/migrations/`, sempre para a frente; não se edita migration que já entrou na `main`.
  Crie o arquivo com `pnpm db run -- migration new <schema>_<slug> < /dev/null` (sem o `< /dev/null` o CLI espera SQL
  pela entrada).
- A versão (o número antes do `_`) é única e maior que a última da `main`: o CI reprova repetida ou menor. Antes do
  push, rode `git fetch origin main && ATTA_PR=<n> sh scripts/checa-migrations.sh origin/main`. Versão nova (ADR 0001 §3):
  o maior entre a hora UTC exata e a última da `main` + o número do PR em segundos, recalculada no rebase; nunca número
  redondo (ex.: main em 20261120174500 e PR #65 → 20261120174605). A mensagem do CI já diz o valor.
- Toda tabela com RLS ligada **e forçada**, e grants explícitos; o `public` fica vazio. Os portões pgTAP do CI
  conferem (ADR 0001 §2 e §3).
- Aplicar na nuvem (projeto dos EUA, só dados fictícios): só o Backend 1, depois do merge na `main`.

## Chaves
Só pelo cofre do OpenBot, lidas do arquivo no comando, e na Vercel pelo CTO. Nunca em código, commit, PR, chat ou
`.env` versionado. O `.env.example` lista os nomes, sem valor.
