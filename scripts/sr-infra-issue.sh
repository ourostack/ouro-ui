#!/usr/bin/env bash
# Reports a screen-reader lane run that could not drive its screen reader (scripts/sr-classify.mjs:
# infrastructure) in one issue labelled `screen-reader-infra`: opens it, or comments on it when one
# is already open, and prints its URL. The nightly lane (screen-reader.yml) and the release gate
# (release.yml, after a second infrastructure failure) run it.
#
#   scripts/sr-infra-issue.sh <run-url> <context>
#
# Needs gh with GH_TOKEN and GH_REPO set, and `issues: write`.
set -euo pipefail

url=${1:?usage: sr-infra-issue.sh <run-url> <context>}
context=${2:?usage: sr-infra-issue.sh <run-url> <context>}
label=screen-reader-infra
gh label create "$label" --color BFD4F2 --description "The screen-reader lane could not drive its screen reader" >/dev/null 2>&1 || true
number=$(gh issue list --state open --label "$label" --json number --jq '.[0].number // empty')
if [ -n "$number" ]; then
  gh issue comment "$number" --body "Failed again ($context): $url" >/dev/null
else
  number=$(gh issue create --title "Screen-reader lane: infrastructure failure" --label "$label" --body "The screen-reader lane could not drive VoiceOver or NVDA ($context): $url

This is not a finding about the components (scripts/sr-classify.mjs). Open the run's log, fix the runner setup (docs/guides/screen-reader-lane.md), and close this issue once a run passes." | grep -o '[0-9]*$')
fi
echo "https://github.com/$GH_REPO/issues/$number"
