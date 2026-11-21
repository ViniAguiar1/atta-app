#!/bin/sh
# Testes do scripts/maquina.sh e do limite de instâncias do scripts/supabase-local.sh, com docker, ps, lsof, supabase e
# kill de mentira (sem rede, sem Docker de verdade). sh scripts/maquina.test.sh
set -eu

dir="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
falhas=0
tem() { if printf '%s' "$2" | grep -q -F -- "$3"; then echo "ok: $1"; else echo "FALHOU: $1 (esperado: $3)"; echo "$2"; falhas=$((falhas + 1)); fi; }
nao_tem() { if printf '%s' "$2" | grep -q -F -- "$3"; then echo "FALHOU: $1 (não devia ter: $3)"; echo "$2"; falhas=$((falhas + 1)); else echo "ok: $1"; fi; }

# hora fixa: 2026-11-21 12:00:00 UTC
agora="$(date -u -d '2026-11-21 12:00:00' +%s 2>/dev/null || date -u -j -f '%Y-%m-%d %H:%M:%S' '2026-11-21 12:00:00' +%s)"

mkdir -p "$tmp/bin"
# duas worktrees: uma do atta-app e uma de outro projeto do Mac (o lsof de mentira devolve o cwd de cada processo)
git -C "$tmp" init -q atta && git -C "$tmp/atta" remote add origin git@github.com:ViniAguiar1/atta-app.git
git -C "$tmp" init -q outro && git -C "$tmp/outro" remote add origin https://github.com/AguiarLabs/gestiva-app.git
cat > "$tmp/bin/docker" <<'EOF'
#!/bin/sh
case "$1" in
  ps) printf '%s\n' ${FAKE_PROJETOS:-} ;;
  inspect) case "$*" in
      *atta-app-be1*) echo 2026-11-21T10:00:00.5Z ;; *atta-app-qa2*) echo 2026-11-21T09:30:00.1Z ;;
      *) echo 2026-11-21T11:50:00.0Z ;; esac ;;
esac
EOF
cat > "$tmp/bin/lsof" <<EOF
#!/bin/sh
case "\$*" in
  *TCP:43421*|*TCP:3001*) printf 'COMMAND PID\\ncom.docke 1\\n' ;;
  *"-p 555 "*) echo "n$tmp/outro" ;;
  *"-d cwd"*) echo "n$tmp/atta" ;;
esac
EOF
cat > "$tmp/bin/ps" <<'EOF'
#!/bin/sh
case "$*" in
  *"-E"*"-p 333"*) echo "node test HOME=/Users/alguem ATTA_SIGLA=FE2 SEGREDO=nao-mostra" ;;
  *"-E"*) echo "node test HOME=/Users/alguem SEGREDO=nao-mostra" ;;
  *) printf '%s\n' \
       "111 02:30:00 node /Users/alguem/wt/x/node_modules/.bin/next dev --port 3020" \
       "222 10:00 node /Users/alguem/wt/y/node_modules/.bin/next dev -p 3001" \
       "333 01-00:00:00 node /Users/alguem/wt/z/node_modules/playwright/cli.js test" \
       "444 05:00 node /Users/alguem/outra-coisa.js" \
       "555 03:00:00 node /Users/alguem/gestiva/node_modules/.bin/next dev --port 3019" \
       "666 03:00:00 node /Users/alguem/wt/w/node_modules/.bin/next dev" \
       "777 03:00:00 vim notas-sobre-next dev e playwright test.md" \
       "888 02:00:00 node /Users/alguem/wt/v/node_modules/playwright/cli.js test" ;;
esac
EOF
printf '#!/bin/sh\necho "supabase $*" >> "%s/acoes"\n' "$tmp" > "$tmp/bin/supabase"
printf '#!/bin/sh\necho "kill $*" >> "%s/acoes"\n' "$tmp" > "$tmp/kill"
chmod +x "$tmp/bin/"* "$tmp/kill"
roda() { PATH="$tmp/bin:$PATH" MAQUINA_AGORA="$agora" MAQUINA_KILL="$tmp/kill" "$@"; }

# listar
FAKE_PROJETOS="atta-app-be1 atta-app-qa2 atta-app chattie-local"
export FAKE_PROJETOS
saida="$(roda sh "$dir/maquina.sh")"
tem "Supabase em uso (BE1, 2 h, com conexão)" "$saida" "BE1    supabase        2h00min   43421  em uso (1 conexões)"
tem "Supabase parado (QA2, 2h30, sem conexão)" "$saida" "QA2    supabase        2h30min   45121  parado"
tem "Supabase do CI (10 min)" "$saida" "(CI)   supabase        0h10min   43321  em uso (0 conexões)"
nao_tem "outro projeto (Chattie) não entra" "$saida" "chattie"
tem "next dev parado da DEVEX (porta 3020)" "$saida" "DEVEX  next dev        2h30min   3020   parado"
tem "next dev em uso do BE1 (porta 3001)" "$saida" "BE1    next dev        0h10min   3001   em uso (1 conexões)"
tem "playwright travado do FE2 (sigla pelo ATTA_SIGLA)" "$saida" "FE2    playwright test 24h00min  -      parado (travado)"
nao_tem "nenhum caminho de usuário na saída" "$saida" "/Users/"
nao_tem "nada do ambiente além da sigla" "$saida" "SEGREDO"
nao_tem "next dev de outro projeto do Mac (Gestiva) não aparece" "$saida" "3019"
nao_tem "processo que não é do node não aparece" "$saida" "notas"
tem "next dev do atta-app sem sigla aparece, mas não é desligado" "$saida" "?      next dev        3h00min   3000   parado, sem sigla: não desligo"
tem "playwright do atta-app sem sigla não é desligado" "$saida" "?      playwright test 2h00min   -      parado (travado), sem sigla: não desligo"
tem "total de Supabase ligados" "$saida" "Supabase locais ligados: 3 (máximo 6)"
[ ! -f "$tmp/acoes" ] && echo "ok: listar não para nada" || { echo "FALHOU: listar parou algo"; falhas=$((falhas + 1)); }

# parar os parados
roda sh "$dir/maquina.sh" --parar-parados > /dev/null
acoes="$(cat "$tmp/acoes")"
tem "para o Supabase parado (QA2), guardando os dados" "$acoes" "supabase stop --project-id atta-app-qa2"
nao_tem "não para o Supabase em uso (BE1)" "$acoes" "atta-app-be1"
tem "mata o next dev parado (111)" "$acoes" "kill 111"
tem "mata o playwright travado (333)" "$acoes" "kill 333"
nao_tem "não mata o next dev em uso (222)" "$acoes" "kill 222"
nao_tem "não mata o next dev de outro projeto (555)" "$acoes" "kill 555"
nao_tem "não mata o next dev sem sigla (666)" "$acoes" "kill 666"
nao_tem "não mata o que não é do node (777)" "$acoes" "kill 777"
nao_tem "não mata o playwright sem sigla (888)" "$acoes" "kill 888"
rm -f "$tmp/acoes"

# limite de 6 Supabase no supabase-local.sh
# sem a variável CI (no GitHub ela vem ligada e desliga o limite), menos no caso que testa o CI
inicia() { (cd "$tmp" && env -u CI PATH="$tmp/bin:$PATH" ATTA_CARGA_ATUAL=1 ATTA_SIGLA=DEVEX "$@" sh "$dir/supabase-local.sh" start 2>&1); }
seis="atta-app-be1 atta-app-be2 atta-app-fe atta-app-qa atta-app-tl atta-app-int"
set +e
saida="$(FAKE_PROJETOS="$seis" inicia)"; rc=$?
set -e
[ "$rc" -eq 1 ] && echo "ok: a 7ª instância é recusada" || { echo "FALHOU: a 7ª subiu (saída $rc)"; falhas=$((falhas + 1)); }
tem "a recusa diz quantas e de quem" "$saida" "já há 6 Supabase locais ligados (BE1, BE2, FE, INT, QA, TL); o máximo é 6"
saida="$(FAKE_PROJETOS="atta-app-be1 atta-app-be2" inicia)"
tem "com 2 ligadas, sobe" "$saida" "instância atta-app-devex"
saida="$(FAKE_PROJETOS="atta-app-be1 atta-app-be2 atta-app-fe atta-app-qa atta-app-tl atta-app-devex" inicia)"
tem "a sua já ligada não conta como nova" "$saida" "instância atta-app-devex"
saida="$(FAKE_PROJETOS="$seis" inicia CI=true)"
tem "no CI não há limite" "$saida" "instância atta-app-devex"
saida="$(FAKE_PROJETOS="$seis" inicia ATTA_SUPABASE_MAX=8)"
tem "ATTA_SUPABASE_MAX muda o limite" "$saida" "instância atta-app-devex"

[ "$falhas" -eq 0 ] && echo "maquina: todos os casos passaram" || exit 1
