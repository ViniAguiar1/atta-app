#!/bin/sh
# O que está ligado no Mac compartilhado pelos agentes, por sigla (pedido do CTO em 21/11, depois de o Mac travar):
# os Supabase locais do atta-app, os `next dev` e os `playwright test`, com o tempo de cada um. Mostra só sigla,
# processo, tempo, porta e estado; nunca caminho, usuário ou conteúdo.
#
# Uso:  pnpm maquina                      lista
#       pnpm maquina --parar-parados      para o que está sem uso há mais de 1 h:
#         - Supabase: ligado há mais de 1 h e sem conexão aberta na API nem no banco agora
#           (supabase stop --project-id; os dados ficam, o próximo start volta igual);
#         - next dev: aberto há mais de 1 h e sem conexão na porta agora (kill);
#         - playwright test: rodando há mais de 1 h, o que é sempre travado (kill).
#       Só processos do node numa worktree do ViniAguiar1/atta-app; sem sigla, aparece mas nunca é desligado.
# MAQUINA_PARADO_SEG muda o limite (padrão 3600). Os testes usam MAQUINA_AGORA e MAQUINA_KILL.
set -eu

case "${1:-}" in
  "" | --listar) parar=0 ;;
  --parar-parados) parar=1 ;;
  *) echo "uso: pnpm maquina [--parar-parados]" >&2; exit 2 ;;
esac
limite="${MAQUINA_PARADO_SEG:-3600}"
agora="${MAQUINA_AGORA:-$(date +%s)}"
matar="${MAQUINA_KILL:-kill}"
raiz="$(cd "$(dirname "$0")/.." && pwd)"
siglas="$(sed -n -E 's/^SIGLAS="([^"]*)"/\1/p' "$raiz/scripts/supabase-local.sh")"

# --- ajudantes -------------------------------------------------------------------------------------------------------
iso_seg() { # 2026-11-21T13:00:00.123Z → segundos
  s="${1%%.*}"; s="${s%Z}"
  date -u -d "$s" +%s 2>/dev/null || date -u -j -f %Y-%m-%dT%H:%M:%S "$s" +%s 2>/dev/null || echo "$agora"
}
etime_seg() { # [[dd-]hh:]mm:ss → segundos
  echo "$1" | awk -F'[-:]' '{ n = NF; s = $n + 60 * $(n-1); if (n >= 3) s += 3600 * $(n-2); if (n >= 4) s += 86400 * $(n-3); print s }'
}
tempo() { s="$1"; printf '%dh%02dmin' $((s / 3600)) $((s % 3600 / 60)); }
slot_da_sigla() { i=0; for s in $siglas; do i=$((i + 1)); [ "$s" = "$1" ] && { echo "$i"; return; }; done; echo 0; }
sigla_do_slot() { i=0; for s in $siglas; do i=$((i + 1)); [ "$i" = "$1" ] && { echo "$s"; return; }; done; echo "?"; }
conexoes() { lsof -nP -iTCP:"$1" -sTCP:ESTABLISHED 2>/dev/null | awk 'NR > 1' | wc -l | tr -d ' '; }
# diretório de trabalho de um processo (Mac: lsof; Linux: /proc), só para conferir o repo; nunca é impresso
cwd_do() {
  lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1 || true
  [ -r "/proc/$1/cwd" ] && readlink "/proc/$1/cwd" 2>/dev/null || true
}
# o processo roda numa worktree do atta-app (remote origin = ViniAguiar1/atta-app)?
do_atta_app() {
  d="$(cwd_do "$1" | head -1)"
  [ -n "$d" ] && git -C "$d" remote get-url origin 2>/dev/null | grep -q -E '[:/]ViniAguiar1/atta-app(\.git)?$'
}
linha() { printf '%-6s %-15s %-9s %-6s %s\n' "$1" "$2" "$3" "$4" "$5"; }

linha SIGLA PROCESSO TEMPO PORTA ESTADO
ligados=0; parados=0

# --- Supabase locais do atta-app (projetos atta-app e atta-app-<sigla>) --------------------------------------------
for proj in $(docker ps --filter label=com.supabase.cli.project --format '{{.Label "com.supabase.cli.project"}}' 2>/dev/null |
  grep -E '^atta-app(-[a-z0-9]+)?$' | sort -u); do
  if [ "$proj" = atta-app ]; then sigla="(CI)"; slot=0; else
    sigla="$(echo "${proj#atta-app-}" | tr 'a-z' 'A-Z')"; slot="$(slot_da_sigla "$sigla")"
  fi
  api=$((43321 + 100 * slot))
  seg=$((agora - $(iso_seg "$(docker inspect -f '{{.State.StartedAt}}' "supabase_db_$proj" 2>/dev/null || echo)")))
  c=$(($(conexoes "$api") + $(conexoes $((api + 1)))))
  estado="em uso ($c conexões)"
  if [ "$seg" -gt "$limite" ] && [ "$c" -eq 0 ]; then
    estado="parado"
    if [ "$parar" = 1 ]; then (cd "$raiz" && supabase stop --project-id "$proj" >/dev/null 2>&1) && estado="parado → desligado"; parados=$((parados + 1)); fi
  fi
  linha "$sigla" "supabase" "$(tempo "$seg")" "$api" "$estado"; ligados=$((ligados + 1))
done

# --- next dev e playwright test, só do atta-app -----------------------------------------------------------------------
# Só processos do node (o primeiro item do comando é o binário node) e só numa worktree do ViniAguiar1/atta-app: os de
# outros projetos do Mac (Gestiva, Chattie...) nem aparecem (revisão do TL e da Segurança no #270).
ps -axo pid=,etime=,command= 2>/dev/null | while read -r pid etime cmd; do
  case "${cmd%% *}" in node | */node) ;; *) continue ;; esac
  case "$cmd" in
    *"/next dev"* | *" next dev"*) tipo="next dev" ;;
    *"playwright test"* | *"playwright/cli.js test"*) tipo="playwright test" ;;
    *) continue ;;
  esac
  do_atta_app "$pid" || continue
  seg="$(etime_seg "$etime")"
  if [ "$tipo" = "next dev" ]; then
    porta="$(echo "$cmd" | sed -n -E 's/.*(--port[ =]|-p )([0-9]+).*/\2/p')"; porta="${porta:-3000}"
    sigla="$(sigla_do_slot $((porta - 3000)))"; [ "$porta" = 3000 ] && sigla="?"
    c="$(conexoes "$porta")"; estado="em uso ($c conexões)"
    [ "$seg" -gt "$limite" ] && [ "$c" -eq 0 ] && estado="parado"
  else
    porta="-"
    sigla="$( (ps -E -o command= -p "$pid" 2>/dev/null || tr '\0' ' ' < "/proc/$pid/environ" 2>/dev/null) |
      grep -o -E 'ATTA_SIGLA=[A-Z0-9]+' | head -1 | cut -d= -f2)"; sigla="${sigla:-?}"
    estado="rodando"; [ "$seg" -gt "$limite" ] && estado="parado (travado)"
  fi
  # sem sigla não se sabe de quem é: só aparece, nunca é desligado
  if [ "$sigla" = "?" ] && [ "${estado%% *}" = parado ]; then estado="$estado, sem sigla: não desligo"
  elif [ "$parar" = 1 ] && [ "${estado%% *}" = parado ]; then $matar "$pid" 2>/dev/null && estado="$estado → desligado"; fi
  linha "$sigla" "$tipo" "$(tempo "$seg")" "$porta" "$estado"
done

[ "$parar" = 1 ] && echo "Supabase desligados: $parados de $ligados ligados" || echo "Supabase locais ligados: $ligados (máximo ${ATTA_SUPABASE_MAX:-6})"
