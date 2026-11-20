#!/bin/sh
# Versões das migrations (supabase/migrations/<versão>_<nome>.sql), checagem rápida e sem Supabase (pedido do TL em 20/11,
# depois de três conflitos de versão no mesmo dia; ADR 0001 §3). Reprova quando:
#   (a) duas migrations da árvore atual têm a mesma versão;
#   (b) com BASE: uma migration nova ou renomeada em BASE...HEAD tem versão menor ou igual à maior versão de BASE.
#       O `supabase db push` recusa migration anterior à última aplicada, e duas trilhas acabam disputando o número.
#   (c) com BASE: uma linha nova de migration usa `errcode`/`sqlstate`/condição fora da lista que o src/lib/errors
#       mapeia (ADR 0001 §5): código fora dela vira INTERNO na tela.
#
# Uso:  sh scripts/checa-migrations.sh                       só (a), na árvore atual
#       sh scripts/checa-migrations.sh origin/main [HEAD]    (a) e (b): rode antes do push, depois de `git fetch`
set -eu

dir=supabase/migrations
base="${1:-}"
head="${2:-HEAD}"
erro=0

# códigos SQLSTATE que o src/lib/errors traduz (ADR 0001 §5) e os nomes de condição equivalentes
CODIGOS_OK="P0001 P0002 42501 23505 23514 23502 23503 22023 40001"
NOMES_OK="raise_exception no_data_found insufficient_privilege unique_violation check_violation not_null_violation foreign_key_violation invalid_parameter_value serialization_failure"
NIVEIS="exception notice warning info log debug using sqlstate"

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
  # (c) códigos de erro nas linhas novas das migrations do PR
  for f in $(git diff --diff-filter=AMR --name-only "$base...$head" -- "$dir" | grep -E '\.sql$' || true); do
    linhas="$(git diff -U0 "$base...$head" -- "$f" | grep -E '^\+' | grep -v -E '^\+\+\+' || true)"
    [ -n "$linhas" ] || continue
    codigos="$(printf '%s\n' "$linhas" | grep -o -i -E "(errcode[[:space:]]*:?=[[:space:]]*|sqlstate[[:space:]]+)'[^']*'" |
      sed -E "s/^[^']*'([^']*)'$/\\1/" || true)"
    nomes="$(printf '%s\n' "$linhas" | tr 'A-Z' 'a-z' |
      sed -n -E 's/.*raise[[:space:]]+(exception[[:space:]]+)?([a-z_]+)[[:space:]]*(using|;).*/\2/p' || true)"
    for c in $codigos; do
      cu="$(printf '%s' "$c" | tr 'a-z' 'A-Z')"; cl="$(printf '%s' "$c" | tr 'A-Z' 'a-z')"
      case " $CODIGOS_OK " in *" $cu "*) continue ;; esac
      case " $NOMES_OK " in *" $cl "*) continue ;; esac
      echo "::error::$f: errcode '$c' fora da lista que o src/lib/errors mapeia (ADR 0001 §5: $CODIGOS_OK). Use um desses; outro código vira INTERNO na tela."
      erro=1
    done
    for nm in $nomes; do
      case " $NIVEIS $NOMES_OK " in *" $nm "*) continue ;; esac
      echo "::error::$f: raise com a condição '$nm', fora da lista que o src/lib/errors mapeia (ADR 0001 §5: $CODIGOS_OK)."
      erro=1
    done
  done
  [ "$erro" -ne 0 ] || echo "migrations ok: nenhuma versão repetida, as novas são maiores que ${ultima:-(nenhuma na base)} e os códigos de erro estão na lista"
else
  [ "$erro" -ne 0 ] || echo "migrations ok: nenhuma versão repetida"
fi
exit "$erro"
