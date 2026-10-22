#!/usr/bin/env bash
# Waits for workflow runs (CI, and the other workflows that report main's required checks,
# scripts/required-producers.mjs), then passes when each check main's rules require passed in
# them: a job of that name that succeeded, or one of the jobs that skip by design (install-latest,
# install-github). The runs' other jobs, ci-budget among them, do not decide: GitHub's own run
# conclusion, which they do, stopped Release for v1.2.0 when only ci-budget had failed.
#
#   scripts/required-ci.sh <run id>...   needs gh with GH_TOKEN, and GITHUB_REPOSITORY
set -uo pipefail

[ "$#" -gt 0 ] || { echo "usage: required-ci.sh <run id>..."; exit 2; }
for run in "$@"; do
  # Its exit status says whether every job passed; the required checks decide below.
  gh run watch "$run" --interval 30 >/dev/null || true
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
  conclusions=$(awk -F '\t' -v name="$context" '$1 == name { print $2 }' <<<"$jobs")
  if [ -z "$conclusions" ]; then
    failed+=("$context: not in the run")
    continue
  fi
  while IFS= read -r conclusion; do
    case "$conclusion" in
      success) ;;
      skipped) case "$context" in install-latest | install-github) ;; *) failed+=("$context: skipped") ;; esac ;;
      *) failed+=("$context: ${conclusion:-not finished}") ;;
    esac
  done <<<"$conclusions"
done <<<"$required"
if [ "${#failed[@]}" -gt 0 ]; then
  echo "::error::Runs $* did not pass the checks main's rules require: $(IFS=';'; echo "${failed[*]}" | sed 's/;/; /g')."
  exit 1
fi
echo "Runs $* passed the checks main's rules require."
