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
# PAGES_CLEAR_SLEEP (default 5 s) bound the wait, three minutes in all. It never fails the job: a deployment it cannot read
# or clear is left to deploy-pages, which fails as before.
set -euo pipefail

current="$1"
tries="${PAGES_CLEAR_TRIES:-36}"
pause="${PAGES_CLEAR_SLEEP:-5}"
settled='^(succeed|deployment_cancelled|deployment_failed|deployment_content_failed|deployment_lost|deployment_attempt_error|deployment_perms_error|unknown)$'
done_ok='^(succeed|unknown)$'

status_of() {
  gh api "repos/$GH_REPO/pages/deployments/$1" --jq .status 2>/dev/null || echo unknown
}

for sha in $(gh api "repos/$GH_REPO/deployments?environment=github-pages&per_page=5" --jq '.[].sha' 2>/dev/null | awk '!seen[$0]++'); do
  [ "$sha" = "$current" ] && continue
  status=$(status_of "$sha")
  [[ "$status" =~ $done_ok ]] && continue
  echo "The Pages deployment of $sha is $status: cancelling it, so this one can deploy (ourostack/ouro-ui#2447)."
  gh api -X POST "repos/$GH_REPO/pages/deployments/$sha/cancel" > /dev/null 2>&1 || echo "Could not cancel it; waiting for it instead."
  for _ in $(seq 1 "$tries"); do
    status=$(status_of "$sha")
    [[ "$status" =~ $settled ]] && break
    sleep "$pause"
  done
  echo "The Pages deployment of $sha is now $status."
done
