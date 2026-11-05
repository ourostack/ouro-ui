#!/bin/bash
# Polls PR $1 every 5 minutes until it merges (or closes), up to $2 polls.
for i in $(seq 1 ${2:-60}); do
  G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1)
  s=$(node $G personal pr view $1 --repo ourostack/ouro-ui --json state -q .state 2>/dev/null)
  echo "$(date -u +%H:%M) #$1 $s"
  [ "$s" = MERGED ] || [ "$s" = CLOSED ] && exit 0
  sleep 300
done
exit 1
