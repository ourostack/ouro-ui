#!/usr/bin/env bash
# Reports a failed Scheduled install run (scheduled-install.yml) in one issue, "Scheduled
# install failed": opens it, or comments on it when it is already open, so the failure
# shows where the team looks and repeats don't pile up as new issues.
#
#   scripts/scheduled-failure.sh <run-url>
#
# Needs gh with GH_TOKEN and GH_REPO set; the job that runs it has `issues: write`.
set -euo pipefail

url=${1:?usage: scheduled-failure.sh <run-url>}
title="Scheduled install failed"
body="The weekly install of main and the newest release failed: $url

A dependency release may have changed what an Ouro install gets (item ranges float), or main's newest release no longer matches GitHub's. Open the run, fix the cause on main, and close this issue once a run passes."
number=$(gh issue list --state open --search "in:title \"$title\"" --json number,title --jq "map(select(.title == \"$title\")) | .[0].number // empty")
if [ -n "$number" ]; then
  gh issue comment "$number" --body "Failed again: $url"
else
  gh issue create --title "$title" --body "$body"
fi
