#!/usr/bin/env bash
# Force-pushes a pin's branch. GitHub refuses a push to a branch whose pull request entered the merge queue after the
# workflow looked (GH006, "queued for merging cannot be updated"): that one refusal exits green with queued=true in
# $GITHUB_OUTPUT, so the queued pin lands and the next release pins again. Any other failure still fails.
set -uo pipefail
branch=$1
err=$(mktemp)
git push -q --force origin "$branch" 2>"$err"
status=$?
if [ "$status" -eq 0 ]; then
  rm -f "$err"
  exit 0
fi
cat "$err" >&2
if grep -q "queued for merging cannot be updated" "$err"; then
  rm -f "$err"
  echo "::notice::$branch is queued for merging, so GitHub refused the push; the queued pin lands and the next release pins again."
  echo "queued=true" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi
rm -f "$err"
exit "$status"
