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
# Uma sigla por agente, o slot é a posição na lista (começa em 1). Sigla nova entra NO FIM, para os slots existentes
# não mudarem. Slot 0 (sem sigla) é só do CI.
SIGLAS="BE1 BE2 BE3 INT FE FE2 TL QA FE3 BE4 BE5 SEC BE6 INT2 FE4 FE5 FE6 QA2 TLF DEVEX"
if [ -z "$sigla" ] && [ -z "${CI:-}" ]; then
  echo "defina ATTA_SIGLA ($SIGLAS): cada agente sobe a própria instância" >&2
  exit 2
fi
slot=0
if [ -n "$sigla" ]; then
  i=0
  for s in $SIGLAS; do
    i=$((i + 1))
    if [ "$s" = "$sigla" ]; then slot=$i; fi
  done
  if [ "$slot" -eq 0 ]; then
    echo "sigla desconhecida: $sigla (use uma de: $SIGLAS)" >&2
    exit 2
  fi
fi

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
# no máximo ATTA_SUPABASE_MAX (padrão 6) Supabase do atta-app ligados no Mac compartilhado (pedido do CTO, 21/11)
limite_de_instancias() {
  [ -z "${CI:-}" ] || return 0
  ligadas="$(docker ps --filter label=com.supabase.cli.project --format '{{.Label "com.supabase.cli.project"}}' 2>/dev/null |
    grep -E '^atta-app(-[a-z0-9]+)?$' | sort -u || true)"
  printf '%s\n' "$ligadas" | grep -q -x "$id" && return 0 # a sua já está ligada: o start não sobe outra
  n="$(printf '%s\n' "$ligadas" | grep -c . || true)"
  max="${ATTA_SUPABASE_MAX:-6}"
  if [ "$n" -ge "$max" ]; then
    quem="$(printf '%s\n' "$ligadas" | sed -E 's/^atta-app-?//; s/^$/(CI)/' | tr 'a-z' 'A-Z' | paste -s -d ',' - | sed 's/,/, /g')"
    echo "já há $n Supabase locais ligados ($quem); o máximo é $max. Veja com 'pnpm maquina', peça a quem está parado ou use o CI." >&2
    exit 1
  fi
}

case "$cmd" in
  start)
    sh "$(dirname "$0")/carga-ok.sh" # máquina cheia: não sobe mais um Supabase (no CI, sempre passa)
    limite_de_instancias
    if [ "${ATTA_SUPABASE_COMPLETO:-}" = 1 ]; then supabase start "$@"; else supabase start -x "$leve" "$@"; fi
    echo "instância $id: API http://127.0.0.1:$SUPABASE_API_PORT · banco 127.0.0.1:$SUPABASE_DB_PORT · app na porta $((3000 + slot))"
    ;;
  stop) supabase stop "$@" ;;
  status) supabase status "$@" ;;
  reset) sh "$(dirname "$0")/carga-ok.sh"; supabase db reset "$@" ;;
  test) sh "$(dirname "$0")/carga-ok.sh"; supabase test db "$@" ;;
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
