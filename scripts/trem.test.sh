#!/usr/bin/env bash
# Testes do scripts/trem.sh que não precisam de rede: apelidos fixos dos revisores, o veredito pelo texto do ✅/❌ e as
# assinaturas que não são de ninguém conhecido. bash scripts/trem.test.sh
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
TREM_SO_FUNCOES=1 source "$dir/trem.sh" ensaio
set +e
falhas=0

confere() { # nome esperado obtido
  if [ "$3" = "$2" ]; then echo "ok: $1"; else echo "FALHOU: $1 (esperado: [$2]; veio: [$3])"; falhas=$((falhas + 1)); fi
}

# comentários de mentira, como a API do GitHub devolve
pr() { # pares "AAAA-MM-DDThh:mm:ssZ|corpo"
  local itens="" c d b
  for c in "$@"; do d="${c%%|*}"; b="${c#*|}"; itens="$itens$(jq -cn --arg d "$d" --arg b "$b" '{createdAt: $d, body: $b}'),"; done
  echo "{\"number\": 1, \"comments\": [${itens%,}]}"
}
assinatura() { veredito "$1" "$2" | jq -r 'if . == null then "nenhum" else (.body | split(" — ")[0]) end'; }

# apelidos fixos (pedido do CTO em 21/11): TL Frontend e Security; nada de variação livre
confere "TL Frontend vale como Tech Lead Frontend" "✅ APROVADO (TL Frontend)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL Frontend) — head d2c04bb')" "Tech Lead Frontend")"
confere "TLF continua valendo" "✅ APROVADO (TLF)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TLF) — head x')" "Tech Lead Frontend")"
confere "Security vale como Security Engineer" "✅ APROVADO (Security)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (Security) — ok')" "Security Engineer")"
confere "Segurança vale como Security Engineer" "✅ APROVADO (Segurança)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (Segurança) — ok')" "Security Engineer")"
confere "variação livre não vale (TL Front)" "nenhum" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL Front) — x')" "Tech Lead Frontend")"
confere "TL é o Tech Lead, não o Tech Lead Frontend" "nenhum" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL) — x')" "Tech Lead Frontend")"
confere "o TL Frontend não conta como Tech Lead" "nenhum" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL Frontend) — x')" "Tech Lead")"
confere "o último veredito vale (❌ depois do ✅)" "❌ AJUSTES (TL Frontend)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (Tech Lead Frontend) — a' '2026-11-21T09:00:00Z|❌ AJUSTES (TL Frontend) — b')" "Tech Lead Frontend")"
confere "Revisor: TL Frontend acha o ✅ (Tech Lead Frontend)" "✅ APROVADO (Tech Lead Frontend)" \
  "$(assinatura "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (Tech Lead Frontend) — a')" "TL Frontend")"

# a mensagem mostra a assinatura que não é de ninguém
confere "assinatura sem dono aparece" "TL Front, Seguranca Eng" \
  "$(assinaturas_sem_dono "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL Front) — x' '2026-11-21T08:01:00Z|✅ APROVADO (Backend 6) — y' '2026-11-21T08:02:00Z|❌ AJUSTES (Seguranca Eng) — z' '2026-11-21T08:03:00Z|✅ APROVADO (QA) — w')")"
confere "sem assinatura estranha, nada" "" \
  "$(assinaturas_sem_dono "$(pr '2026-11-21T08:00:00Z|✅ APROVADO (TL Frontend) — x' '2026-11-21T08:01:00Z|✅ APROVADO (Segurança) — y')")"

[ "$falhas" -eq 0 ] && echo "trem.sh: todos os casos passaram" || exit 1
