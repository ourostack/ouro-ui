#!/usr/bin/env bash
# Waits for workflow runs (CI, and the other workflows that report main's required checks,
# scripts/required-producers.mjs), then passes when each check main's rules require, and each
# check named with --also, passed in at least one of them: a job of that name that succeeded, or
# one of the jobs that skip by design (install-latest, install-github). The runs' other jobs,
# ci-budget among them, do not decide: GitHub's own run conclusion, which they do, stopped Release
# for v1.2.0 when only ci-budget had failed. Given several runs of one commit (main's merge queue
# run and the push run after it, which skips the jobs the queue ran), a check passes when any of
# them passed it.
#
#   scripts/required-ci.sh [--also <check>]... <run id>...
#       needs gh with GH_TOKEN, and GITHUB_REPOSITORY; --also names a gate the rules do not
#       require that must pass too (the release commit's install (shadcn@latest, nova)).
set -uo pipefail

also=
while [ "${1:-}" = --also ]; do
  [ -n "${2:-}" ] || { echo "usage: required-ci.sh [--also <check>]... <run id>..."; exit 2; }
  also+="$2"$'\n'
  shift 2
done
[ "$#" -gt 0 ] || { echo "usage: required-ci.sh [--also <check>]... <run id>..."; exit 2; }
for run in "$@"; do
  # Until the run has finished; a read that fails ten times in a row stops the wait.
  errors=0
  until status=$(gh run view "$run" --json status --jq .status) && [ "$status" = completed ]; do
    if [ -z "${status:-}" ]; then
      errors=$((errors + 1))
      [ "$errors" -lt 10 ] || { echo "::error::Could not read the status of run $run."; exit 1; }
    else
      errors=0
    fi
    status=
    sleep "${POLL_SECONDS:-30}"
  done
done
required=$(gh api "repos/$GITHUB_REPOSITORY/rules/branches/main" --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | unique | .[]') || { echo "::error::Could not read main's rules."; exit 1; }
[ -n "$required" ] || { echo "::error::Main's rules require no check."; exit 1; }
jobs=
for run in "$@"; do
  jobs+=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/jobs?per_page=100" --paginate --jq '.jobs[] | [.name, .conclusion] | @tsv') || { echo "::error::Could not read the jobs of run $run."; exit 1; }
  jobs+=$'\n'
done
failed=()
while IFS= read -r context; do
  [ -n "$context" ] || continue
  conclusions=$(awk -F '\t' -v name="$context" '$1 == name { print $2 }' <<<"$jobs")
  if [ -z "$conclusions" ]; then
    failed+=("$context: not in the run")
    continue
  fi
  passed=false
  seen=()
  while IFS= read -r conclusion; do
    case "$conclusion" in
      success) passed=true ;;
      skipped) case "$context" in install-latest | install-github) passed=true ;; *) seen+=(skipped) ;; esac ;;
      *) seen+=("${conclusion:-not finished}") ;;
    esac
  done <<<"$conclusions"
  [ "$passed" = true ] || failed+=("$context: $(IFS=/; echo "${seen[*]}")")
done <<<"$required"$'\n'"$also"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::Runs $* did not pass the checks main's rules require: $(IFS=';'; echo "${failed[*]}" | sed 's/;/; /g')."
  exit 1
fi
echo "Runs $* passed the checks main's rules require."
