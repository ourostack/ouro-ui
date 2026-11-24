#!/usr/bin/env bash
# Clears the way for this run's GitHub Pages deployment (pages.yml): every other recent build's Pages deployment that did
# not succeed is cancelled, and one still in progress is waited on until it settles. GitHub refuses a new deployment while one is in progress
# ("Deployment request failed … due to in progress deployment"), and a deployment can stay in `updating_pages` after
# actions/deploy-pages gives up on it, so the next run's deploy failed though the runs were queued one at a time
# (ourostack/ouro-ui#2447). One that already read deployment_cancelled still held off the next deploys until it was cancelled
# once more, so the cancel goes to every one that did not succeed; cancelling twice is harmless. A Pages deployment's ID is the
# commit it was built from, as deploy-pages names it.
#
#   scripts/pages-clear.sh <this run's commit>
#
# Needs gh with GH_TOKEN and GH_REPO set; the job that runs it has `pages: write`. PAGES_CLEAR_TRIES (default 36) and
# PAGES_CLEAR_SLEEP (default 5 s) bound the wait, three minutes in all. gh itself has no timeout, and a GitHub rate limit
# made one gh api call retry internally for minutes rather than fail (ourostack/ouro-ui#3375); PAGES_CLEAR_GH_TIMEOUT
# (default 20 s, comfortably above how long a single call takes when GitHub answers at all) bounds every gh call with
# the timeout command (coreutils on the ubuntu runner, BSD's own on a contributor's Mac; both take the same
# `timeout <seconds> <command...>` form). The same rate-limit error, read as the deployments list, was split on every
# space into dozens of look-like-a-sha words (the unquoted `for sha in $(...)` that read it); each is now read as one
# whole line instead, so an error body (always more than one word) is skipped as a single line rather than iterated on
# word by word. It never fails the job: a deployment it cannot read or clear is left to deploy-pages, which fails as
# before.
set -euo pipefail

current="$1"
tries="${PAGES_CLEAR_TRIES:-36}"
pause="${PAGES_CLEAR_SLEEP:-5}"
gh_timeout="${PAGES_CLEAR_GH_TIMEOUT:-20}"
settled='^(succeed|deployment_cancelled|deployment_failed|deployment_content_failed|deployment_lost|deployment_attempt_error|deployment_perms_error|unknown)$'
done_ok='^(succeed|unknown)$'

gh_bounded() {
  timeout "$gh_timeout" gh "$@"
}

status_of() {
  gh_bounded api "repos/$GH_REPO/pages/deployments/$1" --jq .status 2>/dev/null || echo unknown
}

while IFS= read -r sha; do
  # One whole line is one sha: an error body leaked onto stdout is more than one word, so it is skipped as a whole line
  # instead of being split on whitespace and iterated on word by word.
  [[ -n "$sha" && "$sha" != *[[:space:]]* ]] || continue
  [ "$sha" = "$current" ] && continue
  status=$(status_of "$sha")
  [[ "$status" =~ $done_ok ]] && continue
  echo "The Pages deployment of $sha is $status: cancelling it, so this one can deploy (ourostack/ouro-ui#2447)."
  gh_bounded api -X POST "repos/$GH_REPO/pages/deployments/$sha/cancel" > /dev/null 2>&1 || echo "Could not cancel it; waiting for it instead."
  for _ in $(seq 1 "$tries"); do
    status=$(status_of "$sha")
    [[ "$status" =~ $settled ]] && break
    sleep "$pause"
  done
  echo "The Pages deployment of $sha is now $status."
done < <(gh_bounded api "repos/$GH_REPO/deployments?environment=github-pages&per_page=5" --jq '.[].sha' 2>/dev/null | awk '!seen[$0]++')
