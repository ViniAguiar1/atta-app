#!/bin/sh
# Testes do scripts/ci-filtro.sh: a classificação por caminho e os caminhos do PR, do lote e da main, com um `gh` de
# mentira e um repositório git temporário (sem rede). sh scripts/ci-filtro.test.sh
set -eu

script="$(cd "$(dirname "$0")" && pwd)/ci-filtro.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falhas=0

confere() { # nome esperado obtido
  if printf '%s' "$3" | grep -q -F -- "$2"; then echo "ok: $1"; else echo "FALHOU: $1 (esperado: $2; veio: $3)"; falhas=$((falhas + 1)); fi
}
cls() { printf '%s\n' "$@" | sh "$script" classifica; }

# classificação por caminho
confere "só banco" "banco=true web=false" "$(cls supabase/migrations/20261120190000_x.sql supabase/tests/a.test.sql)"
confere "só servidor" "banco=false web=false" "$(cls src/server/crypto/cpf.ts)"
confere "tela" "banco=false web=true" "$(cls 'src/app/(clinica)/painel/page.tsx')"
confere "componente" "banco=false web=true" "$(cls src/components/Botao.tsx)"
confere "src/lib comum é tela" "banco=false web=true" "$(cls src/lib/errors.ts)"
confere "tipos gerados: banco, não tela" "banco=true web=false" "$(cls src/lib/supabase/database.types.ts)"
confere "dependências: tela" "banco=false web=true" "$(cls pnpm-lock.yaml)"
confere "esteira: tudo" "banco=true web=true" "$(cls .github/workflows/ci.yml)"
confere "docs e scripts: nada pesado" "banco=false web=false" "$(cls README.md scripts/trem.sh)"

# repositório e gh de mentira
mkdir -p "$tmp/bin" "$tmp/repo"
git -C "$tmp/repo" init -q -b main
git -C "$tmp/repo" -c user.name=t -c user.email=t@t.invalid commit -q --allow-empty -m base
echo "x" > "$tmp/repo/README.md"
git -C "$tmp/repo" add -A && git -C "$tmp/repo" -c user.name=t -c user.email=t@t.invalid commit -q -m docs
base="$(git -C "$tmp/repo" rev-parse HEAD~1)"; head="$(git -C "$tmp/repo" rev-parse HEAD)"
arvore="$(git -C "$tmp/repo" rev-parse 'HEAD^{tree}')"
cat > "$tmp/bin/gh" <<EOF
#!/bin/sh
case "\$*" in
  *pulls/10*) printf '%s\n' \${ETIQUETAS_FALSAS:-} ;;
  *actions/runs*) printf 'aaa https://exemplo.invalid/run/1\nbbb https://exemplo.invalid/run/2\n' ;;
  *git/commits/aaa*) echo outra-arvore ;;
  *git/commits/bbb*) echo "\${ARVORE_LOTE:-nenhuma}" ;;
esac
EOF
chmod +x "$tmp/bin/gh"
roda() { (cd "$tmp/repo" && PATH="$tmp/bin:$PATH" GITHUB_OUTPUT=/dev/null RUNNER_TEMP="$tmp" REPO=o/r PR=10 \
  BASE="$base" HEAD="$head" "$@" sh "$script" 2>&1); }

confere "PR só de docs: sem banco nem e2e" "banco=false web=false" "$(roda env EVENTO=pull_request RAMO_PR=docs/x)"
confere "PR com a etiqueta e2e: e2e roda" "web=true: etiqueta e2e" "$(roda env EVENTO=pull_request RAMO_PR=docs/x ETIQUETAS_FALSAS='fila e2e')"
confere "lote da fila: tudo" "banco=true web=true: lote da fila" "$(roda env EVENTO=pull_request RAMO_PR=lote/123)"
confere "main com a árvore de um lote verde: pula" "banco=false web=false: árvore $arvore já testada inteira no lote verde https://exemplo.invalid/run/2" \
  "$(roda env EVENTO=push REF=refs/heads/main ARVORE_LOTE="$arvore")"
confere "main sem lote igual: tudo" "banco=true web=true: push sem lote verde" "$(roda env EVENTO=push REF=refs/heads/main)"
confere "push em trem/**: tudo" "banco=true web=true" "$(roda env EVENTO=push REF=refs/heads/trem/1)"

[ "$falhas" -eq 0 ] && echo "ci-filtro: todos os casos passaram" || exit 1
