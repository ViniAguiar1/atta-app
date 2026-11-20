#!/bin/sh
# Testes do scripts/checa-migrations.sh num repositório git temporário (sem rede, sem Supabase). Rodam no CI (date do
# GNU) e no Mac (date do BSD): sh scripts/checa-migrations.test.sh
set -eu

script="$(cd "$(dirname "$0")" && pwd)/checa-migrations.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falhas=0

git_() { git -C "$tmp" -c user.name=teste -c user.email=teste@atta-app.invalid -c commit.gpgsign=false "$@"; }

# caso <nome> <saída esperada 0|1> <texto esperado ou -> <arquivos da migration do "PR"...>
caso() {
  nome="$1" espera="$2" texto="$3"; shift 3
  git_ checkout -q -B pr main
  for f in "$@"; do echo "select 1;" > "$tmp/supabase/migrations/$f"; done
  git_ add -A && git_ commit -q -m pr
  set +e
  saida="$(cd "$tmp" && ATTA_PR="${PR:-60}" ATTA_AGORA=20261120170000 sh "$script" main pr 2>&1)"; rc=$?
  set -e
  if [ "$rc" -ne "$espera" ] || { [ "$texto" != - ] && ! printf '%s' "$saida" | grep -q -F -- "$texto"; }; then
    echo "FALHOU: $nome (saída $rc, esperada $espera; texto esperado: $texto)"; echo "$saida"; falhas=$((falhas + 1))
  else
    echo "ok: $nome"
  fi
}

git -C "$tmp" init -q -b main
mkdir -p "$tmp/supabase/migrations"
echo "select 1;" > "$tmp/supabase/migrations/20261120174500_ultima_da_main.sql"
git_ add -A && git_ commit -q -m main

caso "60 s (soma em decimal) é recusado e a sugestão é 20261120174600" 1 \
  "a versão 20261120174560 não é uma hora UTC válida" 20261120174560_soma_decimal.sql
caso "a sugestão do caso de 60 s" 1 "use 20261120174600 (" 20261120174560_soma_decimal.sql
caso "minuto 60 é recusado" 1 "não é uma hora UTC válida" 20261120176000_minuto_60.sql
caso "mês 13 é recusado" 1 "não é uma hora UTC válida" 20261320000000_mes_13.sql
caso "versão válida maior que a última passa" 0 "migrations ok" 20261120174600_certa.sql
caso "versão menor que a última é recusada" 1 "não é maior que a última da main (20261120174500)" 20261120090000_velha.sql
caso "versão repetida é recusada" 1 "versão de migration repetida: 20261120174500" 20261120174500_repetida.sql
PR="60; rm -rf /" caso "ATTA_PR que não é número cai na explicação, sem conta" 1 \
  "e 20261120174500 + o número do seu PR em segundos" 20261120090000_velha.sql

[ "$falhas" -eq 0 ] && echo "checa-migrations: todos os casos passaram ($(date --version >/dev/null 2>&1 && echo GNU || echo BSD))" || exit 1
