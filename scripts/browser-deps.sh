#!/usr/bin/env bash
# Installs the system packages Playwright's browsers need, from <dir>, a folder of .deb files the
# Actions cache keeps per runner image version (.github/actions/playwright-browsers): with dpkg -i,
# which reads no package list and downloads nothing, so a slow Ubuntu mirror cannot hold a job up.
# On a miss, or when dpkg fails, `playwright install-deps` installs them from the network (which
# also mends what dpkg left half done), with apt keeping the .deb files it downloads in <dir> for
# the cache to save.
#
#   scripts/browser-deps.sh <dir> <browser>...
set -euo pipefail

dir=${1:?usage: browser-deps.sh <dir> <browser>...}
shift
here=$(cd "$(dirname "$0")" && pwd)

# Only Linux runners install system packages with apt.
if [ "$(uname -s)" != Linux ]; then
  exec "$here/retry.sh" pnpm exec playwright install-deps "$@"
fi

shopt -s nullglob
debs=("$dir"/*.deb)
if [ "${#debs[@]}" -gt 0 ]; then
  if sudo dpkg -i "${debs[@]}" > "$dir.log" 2>&1; then
    echo "Installed the browsers' ${#debs[@]} system packages from the cache."
    exit 0
  fi
  echo "The cached system packages did not install (dpkg -i, $dir.log); installing them from the network."
fi

mkdir -p "$dir/partial"
printf 'Dir::Cache::Archives "%s/";\nAPT::Keep-Downloaded-Packages "true";\nBinary::apt::APT::Keep-Downloaded-Packages "true";\n' "$dir" | sudo tee /etc/apt/apt.conf.d/90ouro-browser-debs > /dev/null
"$here/retry.sh" pnpm exec playwright install-deps "$@"
# apt leaves partial/ to its own user; the cache's tar reads the folder as the runner's.
sudo chmod -R a+rX "$dir"
