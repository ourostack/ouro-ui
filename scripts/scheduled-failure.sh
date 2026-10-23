#!/usr/bin/env bash
# Reports a failed scheduled run in one issue: "Scheduled install failed" (scheduled-install.yml)
# by default, or the title given. It opens the issue, or comments on it when it is already open, so
# the failure shows where the team looks and repeats don't pile up as new issues.
#
#   scripts/scheduled-failure.sh <run-url> [<title> <what failed>]
#
# Needs gh with GH_TOKEN and GH_REPO set; the job that runs it has `issues: write`. With
# QUIET_HOURS set, an open issue opened or commented on within that many hours gets no comment, so
# an hourly check does not comment hourly.
set -euo pipefail

url=${1:?usage: scheduled-failure.sh <run-url> [<title> <what failed>]}
title=${2:-Scheduled install failed}
if [ -n "${3:-}" ]; then
  body="$3: $url

Open the run, fix the cause on main, and close this issue once a run passes."
else
  body="The weekly install of main and the newest release failed: $url

A dependency release may have changed what an Ouro install gets (item ranges float), or main's newest release no longer matches GitHub's. Open the run, fix the cause on main, and close this issue once a run passes."
fi
number=$(gh issue list --state open --search "in:title \"$title\"" --json number,title --jq "map(select(.title == \"$title\")) | .[0].number // empty")
if [ -n "$number" ]; then
  if [ -n "${QUIET_HOURS:-}" ]; then
    last=$(gh issue view "$number" --json createdAt,comments --jq '[.createdAt] + [.comments[].createdAt] | max | fromdateiso8601')
    if [ $(($(date +%s) - last)) -lt $((QUIET_HOURS * 3600)) ]; then
      echo "Issue #$number was opened or commented on within $QUIET_HOURS hours; no comment."
      exit 0
    fi
  fi
  gh issue comment "$number" --body "Failed again: $url"
else
  gh issue create --title "$title" --body "$body"
fi
