#!/bin/sh
# Versões das migrations (supabase/migrations/<versão>_<nome>.sql), checagem rápida e sem Supabase (pedido do TL em 20/11,
# depois de três conflitos de versão no mesmo dia; ADR 0001 §3). Reprova quando:
#   (a) duas migrations da árvore atual têm a mesma versão;
#   (b) com BASE: uma migration nova ou renomeada em BASE...HEAD tem versão menor ou igual à maior versão de BASE.
#       O `supabase db push` recusa migration anterior à última aplicada, e duas trilhas acabam disputando o número.
#
# Uso:  sh scripts/checa-migrations.sh                       só (a), na árvore atual
#       sh scripts/checa-migrations.sh origin/main [HEAD]    (a) e (b): rode antes do push, depois de `git fetch`
set -eu

dir=supabase/migrations
base="${1:-}"
head="${2:-HEAD}"
erro=0

versao() { basename "$1" | sed -n -E 's/^([0-9]+)_.*\.sql$/\1/p'; }

# (a) versões repetidas na árvore atual (no CI do PR, a árvore é a do PR já juntado com a main)
if [ -d "$dir" ]; then
  for v in $(ls "$dir" | sed -n -E 's/^([0-9]+)_.*\.sql$/\1/p' | sort | uniq -d); do
    arquivos=""; for f in "$dir/${v}"_*.sql; do arquivos="$arquivos ${f##*/}"; done
    echo "::error::versão de migration repetida: $v ($arquivos ). Renomeie a do seu PR para uma versão nova (date -u +%Y%m%d%H%M%S)."
    erro=1
  done
fi

# (b) migration nova ou renomeada com versão que não é maior que a última da base
if [ -n "$base" ]; then
  ultima="$(git ls-tree --name-only "$base" "$dir/" | sed -n -E 's#^.*/([0-9]+)_.*\.sql$#\1#p' | sort -n | tail -1)"
  for f in $(git diff --diff-filter=AR --name-only "$base...$head" -- "$dir" | grep -E '\.sql$' || true); do
    # já existe na base com o mesmo caminho (ex.: PR empilhado sobre outro que entrou por squash): não é nova
    if git cat-file -e "$base:$f" 2>/dev/null; then continue; fi
    v="$(versao "$f")"
    if [ -z "$v" ]; then
      echo "::error::$f: nome sem versão; use <versão>_<nome>.sql, com a versão maior que ${ultima:-a última da main}"
      erro=1
    elif [ -n "$ultima" ] && [ "$v" -le "$ultima" ]; then
      echo "::error::$f: a versão $v não é maior que a última da main ($ultima). Gere uma versão maior que $ultima (por exemplo, date -u +%Y%m%d%H%M%S) e renomeie o arquivo."
      erro=1
    fi
  done
  [ "$erro" -ne 0 ] || echo "migrations ok: nenhuma versão repetida, e as novas são maiores que ${ultima:-(nenhuma na base)}"
else
  [ "$erro" -ne 0 ] || echo "migrations ok: nenhuma versão repetida"
fi
exit "$erro"
