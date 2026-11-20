#!/bin/sh
# Filtro do CI (job `mudancas`): decide se os jobs pesados rodam (proposta do DevEx, seção 6; ok do CTO e do TL em 20/11).
#   - PR: o banco roda quando o PR mexe no banco; o e2e roda quando o PR mexe em tela (lista do TL) ou tem a etiqueta
#     `e2e` (lida na hora pela API: pôr a etiqueta e rodar o CI de novo funciona).
#   - PR de lote da fila (branch lote/*): suíte inteira, sempre. É o portão antes da main.
#   - push na main: pula banco e e2e quando a árvore é a mesma de um lote verde (já testada inteira); senão, tudo.
#   - qualquer outro push (trem/**): suíte inteira.
# Saída: banco=true|false e web=true|false no $GITHUB_OUTPUT, e o motivo no log.
#
# Uso no CI:  sh scripts/ci-filtro.sh            (lê EVENTO, REF, RAMO_PR, BASE, HEAD, PR, REPO e GH_TOKEN do ambiente)
# Teste:      sh scripts/ci-filtro.sh classifica < lista-de-arquivos   →  "banco=… web=…"
set -eu

BANCO_RE='^(supabase/|src/lib/supabase/database\.types\.ts$|scripts/supabase-local\.sh$|\.github/workflows/)'
# Tela (lista do TL) + o que muda o build da tela: dependências e arquivos públicos.
TELA_RE='^(src/app/|src/features/|src/components/|e2e/|public/|src/proxy\.ts$|next\.config\.ts$|playwright\.config\.ts$|package\.json$|pnpm-lock\.yaml$|\.github/workflows/)'
LIB_RE='^src/lib/'
LIB_FORA_RE='^src/lib/supabase/database\.types\.ts$'

classifica() { # lista de arquivos na entrada → "banco=… web=…"
  arquivos="$(cat)"
  banco=false; web=false
  printf '%s\n' "$arquivos" | grep -q -E "$BANCO_RE" && banco=true
  printf '%s\n' "$arquivos" | grep -q -E "$TELA_RE" && web=true
  printf '%s\n' "$arquivos" | grep -E "$LIB_RE" | grep -q -v -E "$LIB_FORA_RE" && web=true
  echo "banco=$banco web=$web"
}

saida() { # banco web motivo
  { echo "banco=$1"; echo "web=$2"; } >> "${GITHUB_OUTPUT:-/dev/null}"
  echo "banco=$1 web=$2: $3"
}

if [ "${1:-}" = classifica ]; then classifica; exit 0; fi

case "${EVENTO:-}" in
  pull_request)
    case "${RAMO_PR:-}" in lote/*) saida true true "lote da fila, suíte inteira"; exit 0 ;; esac
    r="$(git diff --name-only "$BASE...$HEAD" | classifica)"
    banco="$(echo "$r" | sed -E 's/.*banco=([a-z]+).*/\1/')"; web="$(echo "$r" | sed -E 's/.*web=([a-z]+).*/\1/')"
    motivo="pelos caminhos do PR"
    if [ "$web" = false ] && gh api "repos/$REPO/pulls/$PR" --jq '.labels[].name' 2>/dev/null | grep -q -x e2e; then
      web=true; motivo="etiqueta e2e"
    fi
    saida "$banco" "$web" "$motivo"
    ;;
  push)
    if [ "${REF:-}" = refs/heads/main ]; then
      arvore="$(git rev-parse 'HEAD^{tree}')"
      gh api "repos/$REPO/actions/runs?event=pull_request&status=success&per_page=50" \
        --jq '.workflow_runs[] | select(.head_branch | startswith("lote/")) | "\(.head_sha) \(.html_url)"' 2>/dev/null |
        while read -r sha url; do
          if [ "$(gh api "repos/$REPO/git/commits/$sha" --jq .tree.sha 2>/dev/null)" = "$arvore" ]; then
            echo "$url"; break
          fi
        done > "${RUNNER_TEMP:-/tmp}/lote-da-arvore"
      url="$(cat "${RUNNER_TEMP:-/tmp}/lote-da-arvore")"
      if [ -n "$url" ]; then
        saida false false "árvore $arvore já testada inteira no lote verde $url"
        echo "Árvore \`$arvore\` já testada inteira (banco e e2e) no lote verde: $url" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
        exit 0
      fi
    fi
    saida true true "push sem lote verde com a mesma árvore, suíte inteira"
    ;;
  *) saida true true "evento ${EVENTO:-?}, suíte inteira" ;;
esac
