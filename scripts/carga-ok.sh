#!/bin/sh
# Portão de carga do Mac compartilhado pelos agentes (pedido do CTO em 21/11: carga de 240 com 10 núcleos travou o
# Supabase local de todos). Sai 1 se a carga de 1 minuto passar do limite; os scripts locais pesados (pnpm test,
# test:e2e, test:e2e:producao e supabase start) chamam antes de rodar. No CI, sempre passa.
#   ATTA_CARGA_MAX=<n>     limite (padrão 20)
#   ATTA_IGNORA_CARGA=1    pula a checagem (só com motivo; a regra é usar o CI ou esperar)
set -eu

[ -z "${CI:-}" ] || exit 0
[ "${ATTA_IGNORA_CARGA:-}" != 1 ] || exit 0
limite="${ATTA_CARGA_MAX:-20}"

if [ -n "${ATTA_CARGA_ATUAL:-}" ]; then carga="$ATTA_CARGA_ATUAL" # só para teste
elif [ -r /proc/loadavg ]; then carga="$(cut -d' ' -f1 /proc/loadavg)"
else carga="$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print $1}')"
fi
[ -n "$carga" ] || carga="$(uptime | sed -E 's/.*load averages?: *//; s/,/ /g' | awk '{print $1}')"

if awk -v c="$carga" -v l="$limite" 'BEGIN { exit !(c + 0 > l + 0) }'; then
  echo "máquina cheia; use o CI ou espere (carga de 1 min $carga, limite $limite)" >&2
  exit 1
fi
