#!/usr/bin/env bash
# Starts, by dispatch on <ref>, each workflow that reports a check main's rules require
# (scripts/required-producers.mjs: CI and conformance exemptions), and prints their runs' ids once
# each has started on <sha>, for scripts/required-ci.sh. A branch a workflow pushed with
# GITHUB_TOKEN starts no run of its own.
#
#   scripts/dispatch-required.sh <ref> <sha>   needs gh with GH_TOKEN, GITHUB_REPOSITORY and node
set -euo pipefail

ref=${1:?usage: dispatch-required.sh <ref> <sha>}
sha=${2:?usage: dispatch-required.sh <ref> <sha>}
here=$(cd "$(dirname "$0")" && pwd)
producers=$(gh api "repos/$GITHUB_REPOSITORY/rules/branches/main" --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[].context] | unique | .[]' | node "$here/required-producers.mjs")
for workflow in $producers; do
  gh workflow run "$workflow" --ref "$ref" >&2
done
runs=()
for workflow in $producers; do
  run=
  for _ in $(seq 60); do
    run=$(gh run list --workflow "$workflow" --branch "$ref" --commit "$sha" --event workflow_dispatch --json databaseId --jq '.[0].databaseId // empty')
    [ -n "$run" ] && break
    sleep "${POLL_SECONDS:-5}"
  done
  [ -n "$run" ] || { echo "::error::$workflow did not start on $ref ($sha)" >&2; exit 1; }
  runs+=("$run")
done
echo "${runs[*]}"
