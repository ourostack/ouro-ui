#!/bin/bash
# When #394 merges, retarget #430 to main; when #430 merges, retarget #440 to main. Polls every 5 minutes.
W=~/code/ouro-ui-worktrees/polish-springy/.springy/wait-merge.sh
retarget() {
  G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1)
  s=$(node $G personal pr view $1 --repo ourostack/ouro-ui --json state -q .state)
  [ "$s" = OPEN ] && node $G personal pr edit $1 --repo ourostack/ouro-ui --base main && echo "$(date -u +%H:%M) retargeted #$1 to main"
}
$W 394 200 && { G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1); [ "$(node $G personal pr view 394 --repo ourostack/ouro-ui --json state -q .state)" = MERGED ] && retarget 430; }
$W 430 200 && { G=$(ls -dt /Users/microsoft/.local/agency/plugins/sessions/*/root-1/ms-desk/bin/gh-account.mjs | head -1); [ "$(node $G personal pr view 430 --repo ourostack/ouro-ui --json state -q .state)" = MERGED ] && retarget 440; }
echo chain-done
