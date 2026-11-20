#!/bin/sh
# Supabase local por agente, sem colidir (ADR 0001 §3): 7 agentes na mesma máquina, e o bloco 54321-54327 já é do
# Supabase do Chattie. Cada sigla ganha um project_id e um bloco de portas próprios, passados ao CLI por variável de
# ambiente; o config.toml versionado não muda. Sem sigla (só no CI): o bloco padrão do config.toml, 433xx.
#
# Uso:   ATTA_SIGLA=BE1 sh scripts/supabase-local.sh <start|stop|status|reset|test|types|env|run -- <args do supabase>>
#        ou: ATTA_SIGLA=BE1 pnpm db start
# Portas da sigla: 43321 + 100 × slot (API), +1 o banco, +2 o Studio (só com ATTA_SUPABASE_COMPLETO=1), +3 o e-mail.
# Sobe leve por padrão (sem Studio, logs, Edge Runtime nem imgproxy), para caber em RAM junto dos outros agentes.
set -eu

sigla="${ATTA_SIGLA:-}"
if [ -z "$sigla" ] && [ -z "${CI:-}" ]; then
  echo "defina ATTA_SIGLA (BE1, BE2, BE3, INT, FE, FE2, TL ou QA): cada agente sobe a própria instância" >&2
  exit 2
fi
case "$sigla" in
  "") slot=0 ;;
  BE1) slot=1 ;; BE2) slot=2 ;; BE3) slot=3 ;; INT) slot=4 ;;
  FE) slot=5 ;; FE2) slot=6 ;; TL) slot=7 ;; QA) slot=8 ;;
  *) echo "sigla desconhecida: $sigla (use BE1, BE2, BE3, INT, FE, FE2, TL ou QA)" >&2; exit 2 ;;
esac

base=$((43300 + slot * 100))
if [ "$slot" -eq 0 ]; then id=atta-app; else id="atta-app-$(echo "$sigla" | tr 'A-Z' 'a-z')"; fi
export SUPABASE_PROJECT_ID="$id"
export SUPABASE_API_PORT=$((base + 21))
export SUPABASE_DB_PORT=$((base + 22))
export SUPABASE_DB_SHADOW_PORT=$((base + 20))
export SUPABASE_DB_POOLER_PORT=$((base + 29))
export SUPABASE_STUDIO_PORT=$((base + 23))
export SUPABASE_LOCAL_SMTP_PORT=$((base + 24))
export SUPABASE_ANALYTICS_PORT=$((base + 27))
export SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT=$((base + 83))
# o app do agente roda em 3000 + slot (pnpm dev --port), e o login volta para ele
export SUPABASE_AUTH_SITE_URL="http://127.0.0.1:$((3000 + slot))"

leve="studio,logflare,vector,edge-runtime,imgproxy"
cmd="${1:-status}"
[ "$#" -gt 0 ] && shift
case "$cmd" in
  start)
    if [ "${ATTA_SUPABASE_COMPLETO:-}" = 1 ]; then supabase start "$@"; else supabase start -x "$leve" "$@"; fi
    echo "instância $id: API http://127.0.0.1:$SUPABASE_API_PORT · banco 127.0.0.1:$SUPABASE_DB_PORT · app na porta $((3000 + slot))"
    ;;
  stop) supabase stop "$@" ;;
  status) supabase status "$@" ;;
  reset) supabase db reset "$@" ;;
  test) supabase test db "$@" ;;
  types) supabase gen types typescript --local --schema platform,documents,atta_in,api "$@" ;;
  env)
    # as linhas do .env.local desta instância (chaves locais do CLI, nunca as da nuvem), sem aspas: servem também ao
    # $GITHUB_ENV do CI, que não tira aspas
    supabase status -o env | sed -n -E \
      -e 's/^API_URL="?([^"]*)"?$/NEXT_PUBLIC_SUPABASE_URL=\1/p' \
      -e 's/^PUBLISHABLE_KEY="?([^"]*)"?$/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\1/p' \
      -e 's/^SECRET_KEY="?([^"]*)"?$/SUPABASE_SECRET_KEY=\1/p'
    ;;
  run) [ "${1:-}" = "--" ] && shift; supabase "$@" ;;
  *) echo "comando desconhecido: $cmd" >&2; exit 2 ;;
esac
