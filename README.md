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
| FE3 | 44221 | 44222 | 3009 |
| BE4 | 44321 | 44322 | 3010 |
| BE5 | 44421 | 44422 | 3011 |
| SEC | 44521 | 44522 | 3012 |
| BE6 | 44621 | 44622 | 3013 |
| INT2 | 44721 | 44722 | 3014 |
| FE4 | 44821 | 44822 | 3015 |
| FE5 | 44921 | 44922 | 3016 |
| FE6 | 45021 | 45022 | 3017 |
| QA2 | 45121 | 45122 | 3018 |
| TLF | 45221 | 45222 | 3019 |
| DEVEX | 45321 | 45322 | 3020 |

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

## CI: o que roda em cada caso (`scripts/ci-filtro.sh`)

- **Todo PR:** lint, typecheck, vitest, checagem de migrations e vetores do ATTA Sign.
- **Banco (pgTAP + tipos):** no PR que mexe em `supabase/`, nos tipos gerados ou no CI.
- **e2e com axe:** no PR que mexe em tela (`src/app/`, `src/features/`, `src/components/`, `src/lib/` fora dos tipos gerados, `e2e/`, `public/`, `src/proxy.ts`, configs do Next e do Playwright, dependências ou CI). Para forçar, ponha a etiqueta `e2e` e rode o CI de novo (`gh run rerun <id>`) ou faça o próximo push.
- **Lote da fila (`lote/*`):** suíte inteira, sempre. Nada chega à `main` sem ela.
- **Push na `main`:** pula banco e e2e quando a árvore é a mesma de um lote verde (o resumo do job traz o link); senão, roda tudo.

## Trem de merge (`scripts/trem.sh`)

A regra continua a do PLANO: rebase na `main` atual, CI verde nesse estado e um merge por vez. O trem faz isso por todos, sem disputa, testando até 3 PRs em cascata ao mesmo tempo:
`trem/1` = main + A, `trem/2` = main + A + B, `trem/3` = main + A + B + C, cada um com a suíte inteira.

- **Entrada:** o autor põe a etiqueta `fila` quando já tem o ✅ do revisor (no sensível, também do Tech Lead e do Security Engineer) e a prévia da Vercel verde. O ✅ vale para o head atual se as mudanças do PR forem idênticas às do head aprovado (`git patch-id --verbatim` do diff desde a `main` ou só dos commits próprios do PR, descartando com `git cherry` os que já estão na `main`, para o PR de baixo que entrou por rebase não vencer o ✅; espaço e indentação contam; o head aprovado é o SHA citado no ✅ ou o head na hora do comentário). Rebase limpo mantém o ✅; conflito resolvido ou commit novo pede ✅ de novo.
- **Sensível** (exige também o Tech Lead e o Security Engineer): `supabase/migrations|tests`, `src/server/`, `src/lib/supabase/`, auth, saúde, auditoria, cripto, ATTA Sign, grant, middleware/proxy, `.github/workflows/`, `vercel.json`, `next.config.ts`, `scripts/`, `supabase/config.toml`, `package.json`, `pnpm-lock.yaml`, `src/app/(paciente)/`, boarding, check-in, PROpass, ficha, `src/lib/seguranca`, `src/lib/http`, logger e integrações.
- **O autor não aprova o próprio PR:** o ✅ com a mesma sigla da linha `Autor:` não conta.
- **Ordem:** `conserta-main` primeiro, depois a ordem do CTO em `Shared/atta/migracao/fila.md` (lista numerada da seção "Ordem atual") e, por fim, os PRs com a etiqueta `fila` que não estão lá, pelo número.
- **Antes de cada squash:** a árvore do PR rebaseado é idêntica à testada (`HEAD^{tree}`), o head do PR é o mesmo que entrou no trem, as aprovações valem e a `main` não está vermelha. O script deixa no PR o SHA da árvore e o link do CI que a testou.
- **Falha:** o PR sai da fila (`fila-falhou`, comentário com o link) e os de trás voltam na próxima volta.
- Os ramos `trem/*` não geram prévia (`vercel.json`).

```bash
bash scripts/trem.sh ensaio          # padrão: só mostra o que faria (nada de push, comentário ou merge)
bash scripts/trem.sh ensaio 36 38    # ensaio com uma lista de PRs
bash scripts/trem.sh testar          # empurra trem/1..3 e espera o CI (gasta cota do Actions)
TREM_MERGE_LIBERADO=1 bash scripts/trem.sh andar   # faz os merges; só com a decisão do CTO
```

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
  redondo (ex.: main em 20261120174500 e PR #65 → 20261120174605). A mensagem do CI já diz o valor. A versão tem de
  ser uma hora UTC válida: 20261120174560 (60 s, soma em decimal) é recusada, com a sugestão 20261120174600 para o
  PR #60. Casos em `scripts/checa-migrations.test.sh`, que roda no CI.
- Toda tabela com RLS ligada **e forçada**, e grants explícitos; o `public` fica vazio. Os portões pgTAP do CI
  conferem (ADR 0001 §2 e §3).
- Aplicar na nuvem (projeto dos EUA, só dados fictícios): só o Backend 1, depois do merge na `main`.

## Chaves
Só pelo cofre do OpenBot, lidas do arquivo no comando, e na Vercel pelo CTO. Nunca em código, commit, PR, chat ou
`.env` versionado. O `.env.example` lista os nomes, sem valor.
