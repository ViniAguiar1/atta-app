#!/usr/bin/env bash
# Trem de merge do atta-app (proposta do DevEx, aprovada pelo Tech Lead em 20/11 com 5 condições).
# O GitHub Merge Queue não existe em repo de conta pessoal: este script faz o papel dele.
#
#   1. a suíte inteira roda em cada vagão (push em trem/<k> = CI de push, sem filtro de caminho);
#   2. antes do squash, confere a árvore igual (HEAD^{tree}), o head do PR igual ao que entrou no trem e as aprovações
#      valendo (o revisor do PR e, no sensível, o Tech Lead e o Security Engineer);
#   3. comenta no PR o SHA da árvore e o link do CI do trem que a testou;
#   4. a main vermelha para o trem (só passa PR com a etiqueta conserta-main);
#   5. o padrão é ENSAIO: não faz push, não comenta, não faz merge.
#
# Uso:  bash scripts/trem.sh ensaio [PR...]   monta os vagões localmente e mostra o que faria (padrão)
#       bash scripts/trem.sh testar [PR...]   também empurra trem/1..N e espera o CI (gasta cota do Actions)
#       TREM_MERGE_LIBERADO=1 bash scripts/trem.sh andar
#                                           testa e faz o squash na ordem. O merge pelo trem depende do ok do CTO.
# Sem lista de PRs, a fila é: PRs abertos com a etiqueta `fila`, `conserta-main` primeiro, depois a ordem do CTO em
# $TREM_FILA_ARQ (um número por linha) e, por fim, o número do PR.
set -euo pipefail

REPO="${TREM_REPO:-ViniAguiar1/atta-app}"
PROFUNDIDADE="${TREM_PROFUNDIDADE:-3}"
FILA_ARQ="${TREM_FILA_ARQ:-/Users/macbook/OpenBot/Shared/atta/migracao/fila.txt}"
ORIGEM="${TREM_ORIGEM:-$HOME/Development/atta-app}"
DIR="${TREM_DIR:-$HOME/Development/atta-app-wt/trem}"
ESPERA_CI="${TREM_ESPERA_CI:-1200}"
# Sensível (PLANO: segurança, auth, RLS, saúde, auditoria, assinatura): exige também o Tech Lead e o Security Engineer.
SENSIVEL_RE="${TREM_SENSIVEL_RE:-^supabase/(migrations|tests)/|^src/server/|/auth/|auth\.|saude|audit|crypto|atta-sign|assinatura|grant|^(src/)?(middleware|proxy)\.ts$}"

gh_() { GH_CONFIG_DIR="$HOME/.config/gh" gh "$@"; }
log() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
morre() { log "PARADO: $*"; exit 1; }

modo="${1:-ensaio}"
[ "$#" -gt 0 ] && shift
case "$modo" in
  ensaio | testar) ;;
  andar) [ "${TREM_MERGE_LIBERADO:-}" = 1 ] || morre "o modo andar faz merge: precisa de TREM_MERGE_LIBERADO=1 (decisão do CTO)" ;;
  *) morre "modo desconhecido: $modo (ensaio, testar ou andar)" ;;
esac

# Nome por extenso ↔ sigla (PLANO, "Siglas nos PRs"). Uma aprovação "(INT)" vale para "Revisor: Integrações".
apelidos() {
  case "$1" in
    "Backend 1" | BE1) echo "Backend 1|BE1" ;; "Backend 2" | BE2) echo "Backend 2|BE2" ;;
    "Backend 3" | BE3) echo "Backend 3|BE3" ;; "Backend 4" | BE4) echo "Backend 4|BE4" ;;
    "Backend 5" | BE5) echo "Backend 5|BE5" ;; "Backend 6" | BE6) echo "Backend 6|BE6" ;;
    "Integrações" | INT) echo "Integrações|INT" ;; "Integrações 2" | INT2) echo "Integrações 2|INT2" ;;
    "Frontend" | FE) echo "Frontend|FE" ;; "Frontend 2" | FE2) echo "Frontend 2|FE2" ;;
    "Frontend 3" | FE3) echo "Frontend 3|FE3" ;; "Frontend 4" | FE4) echo "Frontend 4|FE4" ;;
    "Frontend 5" | FE5) echo "Frontend 5|FE5" ;; "Frontend 6" | FE6) echo "Frontend 6|FE6" ;;
    "Tech Lead" | TL) echo "Tech Lead|TL" ;; "Tech Lead Frontend" | TLF) echo "Tech Lead Frontend|TLF" ;;
    "Security Engineer" | SEC) echo "Security Engineer|SEC" ;; "QA 2" | QA2) echo "QA 2|QA2" ;;
    QA) echo "QA" ;; DevEx | DEVEX) echo "DevEx|DEVEX" ;;
    *) echo "$1" ;;
  esac
}

# --- leitura do GitHub ----------------------------------------------------------------------------------------------

pr_json() { gh_ pr view "$1" -R "$REPO" --json number,title,state,isDraft,baseRefName,headRefName,headRefOid,headRepositoryOwner,labels,body,files,comments; }

# revisores da linha "Autor: X · Revisor: Y e Z · QA: W"
revisores() {
  jq -r '.body' <<<"$1" | grep -E 'Revisor:' | tail -1 | sed -E 's/.*Revisor:[[:space:]]*//; s/[[:space:]]*·.*//' |
    awk '{ gsub(/[[:space:]]+e[[:space:]]+|,[[:space:]]*/, "\n"); print }' | sed -E 's/^[[:space:]]+|[[:space:]]+$//g' |
    grep -v -E '^(—|-)?$' || true
}

sensivel() { jq -r '.files[].path' <<<"$1" | grep -q -E "$SENSIVEL_RE"; }

# Aprovação vale para o head atual se: é o último veredito daquele revisor e (cita o SHA curto do head ou é posterior
# ao commit do head). Commit novo depois do ✅ pede ✅ de novo.
aprovado_por() {
  local json="$1" quem="$2" head data_head nomes
  head="$(jq -r .headRefOid <<<"$json")"
  data_head="$(gh_ api "repos/$REPO/commits/$head" --jq .commit.committer.date)"
  nomes="$(apelidos "$quem")"
  jq -r --arg nomes "$nomes" --arg h "${head:0:7}" --arg dh "$data_head" '
    [ .comments[] | select(.body | test("^(✅ APROVADO|❌ AJUSTES) \\((" + $nomes + ")\\)")) ] | sort_by(.createdAt) | last
    | if . == null then "nao" elif (.body | startswith("❌")) then "ajustes"
      elif ((.body | contains($h)) or (.createdAt > $dh)) then "sim" else "velho" end' <<<"$json"
}

# devolve "ok" ou o motivo de não poder entrar
pronto() {
  local json="$1" n quem r faltam=""
  n="$(jq -r .number <<<"$json")"
  [ "$(jq -r .state <<<"$json")" = OPEN ] || { echo "não está aberto"; return; }
  [ "$(jq -r .isDraft <<<"$json")" = false ] || { echo "é rascunho"; return; }
  [ "$(jq -r .baseRefName <<<"$json")" = main ] || { echo "a base não é a main"; return; }
  [ "$(jq -r .headRepositoryOwner.login <<<"$json")" = "${REPO%%/*}" ] || { echo "branch fora do repo"; return; }
  if ! gh_ api "repos/$REPO/commits/$(jq -r .headRefOid <<<"$json")/statuses" --jq '.[] | select(.context == "Vercel") | .state' | grep -q '^success$'; then
    echo "prévia da Vercel não está verde no head"; return
  fi
  quem="$(revisores "$json")"
  [ -n "$quem" ] || { echo "sem a linha 'Revisor:' no corpo do PR"; return; }
  if sensivel "$json"; then quem="$(printf '%s\nTech Lead\nSecurity Engineer\n' "$quem" | awk '!v[$0]++')"; fi
  while IFS= read -r rev; do
    [ -n "$rev" ] || continue
    r="$(aprovado_por "$json" "$rev")"
    [ "$r" = sim ] || faltam="$faltam ${rev}($r)"
  done <<<"$quem"
  [ -z "$faltam" ] && echo ok || echo "aprovação faltando ou vencida:$faltam (#$n)"
}

# 'verde', 'vermelha' ou 'pendente' (último CI de push da main que não foi cancelado)
estado_main() {
  gh_ run list -R "$REPO" --branch main --event push --workflow ci --limit 10 --json status,conclusion \
    --jq '[.[] | select(.conclusion != "cancelled")][0] | if .status != "completed" then "pendente"
          elif .conclusion == "success" then "verde" else "vermelha" end'
}

fila() {
  local abertos ordem n
  abertos="$(gh_ pr list -R "$REPO" --state open --label fila --limit 100 --json number,labels \
    --jq '.[] | "\(if any(.labels[]; .name == "conserta-main") then 0 else 1 end) \(.number)"')"
  ordem=""; [ -f "$FILA_ARQ" ] && ordem="$(grep -E '^[[:space:]]*#?[0-9]+' "$FILA_ARQ" | tr -dc '0-9\n')"
  while read -r pri n; do
    [ -n "${n:-}" ] || continue
    pos="$(grep -n -x "$n" <<<"$ordem" | head -1 | cut -d: -f1 || true)"
    printf '%s %06d %06d\n' "$pri" "${pos:-999999}" "$n"
  done <<<"$abertos" | sort | awk '{print $3+0}'
}

# --- montagem dos vagões --------------------------------------------------------------------------------------------

prepara_dir() {
  if [ ! -e "$DIR/.git" ]; then
    git -C "$ORIGEM" worktree add -q --detach "$DIR" >/dev/null
  fi
  git -C "$DIR" fetch -q origin main
}

# monta sobre o HEAD atual o squash do PR; devolve 0 se entrou, 1 se conflitou ou não tem nada novo
vagao() {
  local n="$1" titulo="$2"
  git -C "$DIR" fetch -q origin "+refs/pull/$n/head:refs/trem/pr/$n"
  if ! git -C "$DIR" merge --squash --no-commit "refs/trem/pr/$n" >/dev/null 2>&1; then
    git -C "$DIR" merge --abort 2>/dev/null || git -C "$DIR" reset -q --hard HEAD
    return 1
  fi
  if git -C "$DIR" diff --cached --quiet; then git -C "$DIR" reset -q --hard HEAD; return 1; fi
  git -C "$DIR" -c user.name="Trem atta-app" -c user.email="trem@atta-app.invalid" commit -q --no-verify -m "$titulo (#$n)"
}

ci_do_commit() { # sha → "estado conclusão url" do CI de push
  gh_ api "repos/$REPO/actions/runs?head_sha=$1&event=push&per_page=5" \
    --jq '[.workflow_runs[] | select(.name == "ci")][0] | "\(.status // "nenhum") \(.conclusion // "-") \(.html_url // "-")"'
}

espera_ci() {
  local sha="$1" ini r
  ini="$(date +%s)"
  while :; do
    r="$(ci_do_commit "$sha")"
    case "$r" in completed*) echo "$r"; return ;; esac
    [ $(($(date +%s) - ini)) -lt "$ESPERA_CI" ] || { echo "tempo esgotado - -"; return; }
    sleep 20
  done
}

# --- principal ------------------------------------------------------------------------------------------------------

prepara_dir
main_estado="$(estado_main)"
log "modo $modo · main $(git -C "$DIR" rev-parse --short origin/main) ($main_estado) · profundidade $PROFUNDIDADE"

if [ "$#" -gt 0 ]; then candidatos="$*"; else candidatos="$(fila | tr '\n' ' ')"; fi
[ -n "${candidatos// /}" ] || { log "fila vazia"; exit 0; }

git -C "$DIR" checkout -q --detach origin/main
k=0; vagoes=""
for n in $candidatos; do
  [ "$k" -lt "$PROFUNDIDADE" ] || break
  json="$(pr_json "$n")"
  if [ "$main_estado" = vermelha ] && ! jq -e '.labels | any(.name == "conserta-main")' <<<"$json" >/dev/null; then
    log "#$n fica: main vermelha, só conserta-main passa"; continue
  fi
  motivo="$(pronto "$json")"
  if [ "$motivo" != ok ]; then log "#$n não entra: $motivo"; continue; fi
  if ! vagao "$n" "$(jq -r .title <<<"$json")"; then log "#$n não entra: conflito com a main + vagões da frente (ou nada novo)"; continue; fi
  k=$((k + 1))
  sha="$(git -C "$DIR" rev-parse HEAD)"; arvore="$(git -C "$DIR" rev-parse 'HEAD^{tree}')"
  vagoes="$vagoes $k:$n:$(jq -r .headRefOid <<<"$json"):$sha:$arvore"
  log "trem/$k = main + ...#$n · commit ${sha:0:7} · árvore ${arvore:0:12} · head do PR $(jq -r '.headRefOid[0:7]' <<<"$json")"
done
[ -n "$vagoes" ] || { log "nenhum PR pronto"; exit 0; }

if [ "$modo" = ensaio ]; then
  log "ENSAIO: empurraria trem/1..$k, esperaria o CI de cada um e faria o squash na ordem, conferindo árvore, head e aprovações"
  exit 0
fi

for v in $vagoes; do
  IFS=: read -r k n head sha arvore <<<"$v"
  git -C "$DIR" push -q --force origin "$sha:refs/heads/trem/$k"
  log "trem/$k empurrado (${sha:0:7}): CI de push com a suíte inteira"
done

for v in $vagoes; do
  IFS=: read -r k n head sha arvore <<<"$v"
  read -r estado conclusao url <<<"$(espera_ci "$sha")"
  log "trem/$k (#$n): $estado $conclusao $url"
  if [ "$conclusao" != success ]; then
    if [ "$modo" = andar ] && [ "$conclusao" = failure ]; then
      gh_ pr edit "$n" -R "$REPO" --remove-label fila --add-label fila-falhou >/dev/null
      gh_ pr comment "$n" -R "$REPO" --body "🚂 Trem (DevEx): o vagão \`trem/$k\` (main + os PRs da frente + este) ficou vermelho: $url. O PR saiu da fila. Conserte e ponha a etiqueta \`fila\` de novo." >/dev/null
    fi
    morre "trem/$k não ficou verde: os vagões de trás voltam na próxima volta"
  fi
  [ "$modo" = andar ] || continue

  # condição 4: main vermelha para o trem
  [ "$(estado_main)" != vermelha ] || jq -e '.labels | any(.name == "conserta-main")' <<<"$(pr_json "$n")" >/dev/null ||
    morre "main vermelha: merges congelados"
  # condição 2: head igual ao que entrou e aprovações valendo
  json="$(pr_json "$n")"
  [ "$(jq -r .headRefOid <<<"$json")" = "$head" ] || morre "#$n ganhou commit depois de entrar no trem: volta na próxima volta"
  motivo="$(pronto "$json")"; [ "$motivo" = ok ] || morre "#$n: $motivo"
  # rebase do PR na main atual (um commit só) e árvore igual à testada
  git -C "$DIR" fetch -q origin main
  git -C "$DIR" checkout -q --detach origin/main
  vagao "$n" "$(jq -r .title <<<"$json")" || morre "#$n não aplica mais sobre a main atual"
  novo="$(git -C "$DIR" rev-parse HEAD)"
  [ "$(git -C "$DIR" rev-parse 'HEAD^{tree}')" = "$arvore" ] || morre "#$n: árvore diferente da testada em trem/$k; precisa testar de novo"
  ramo="$(jq -r .headRefName <<<"$json")"
  git -C "$DIR" push -q --force-with-lease="refs/heads/$ramo:$head" origin "$novo:refs/heads/$ramo"
  # condição 3: registro no PR
  gh_ pr comment "$n" -R "$REPO" --body "🚂 Trem (DevEx): árvore \`$arvore\` testada no CI de \`trem/$k\` (\`$sha\`): $url. Head rebaseado na main: \`$novo\`, mesma árvore. Squash agora." >/dev/null
  gh_ pr merge "$n" -R "$REPO" --squash --match-head-commit "$novo" >/dev/null
  git -C "$DIR" fetch -q origin main
  [ "$(git -C "$DIR" rev-parse 'origin/main^{tree}')" = "$arvore" ] || morre "main depois do #$n não tem a árvore testada: confira já"
  log "#$n entrou: main $(git -C "$DIR" rev-parse --short origin/main), árvore ${arvore:0:12}"
  # o CI do PR no head rebaseado repete o trem: cancela para poupar cota
  for id in $(gh_ run list -R "$REPO" --commit "$novo" --json databaseId,status --jq '.[] | select(.status != "completed") | .databaseId'); do
    gh_ run cancel "$id" -R "$REPO" >/dev/null || true
  done
done
log "fim da volta"
