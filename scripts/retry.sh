#!/usr/bin/env bash
# Runs a network fetch, such as the download of Playwright's browsers, and again after a failure,
# waiting longer each time: RETRY_DELAYS lists the waits in seconds (10, 30 and 90 unless set), so
# the fetch runs once more than there are waits. For fetches only: a test is never retried.
set -uo pipefail
read -r -a delays <<<"${RETRY_DELAYS-10 30 90}"
tries=$((${#delays[@]} + 1))
for ((attempt = 1; ; attempt++)); do
  "$@" && exit 0
  status=$?
  if [ "$attempt" -ge "$tries" ]; then
    echo "::error::$* failed $tries times."
    exit "$status"
  fi
  delay=${delays[$((attempt - 1))]}
  echo "::warning::$* failed (try $attempt of $tries); trying again in ${delay}s."
  sleep "$delay"
done
