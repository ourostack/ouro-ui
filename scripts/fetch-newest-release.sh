#!/usr/bin/env bash
set -euo pipefail

tags=$(mktemp)
trap 'rm -f "$tags"' EXIT
bash scripts/retry.sh bash -c 'git ls-remote --tags --refs origin "refs/tags/v*" > "$1"' -- "$tags"
last=$(sed 's#.*refs/tags/##' "$tags" | sort -V | tail -1)
if [ -z "$last" ]; then
  echo "::error::The release-tag lookup returned no version tags. Run git ls-remote --tags --refs origin 'refs/tags/v*'." >&2
  exit 1
fi
bash scripts/retry.sh git fetch --quiet --no-tags --depth=1 origin "refs/tags/$last:refs/tags/$last"
printf 'Fetched newest release tag %s.\n' "$last"
