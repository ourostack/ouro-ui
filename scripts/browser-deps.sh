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

# A second apt (an app's playwright install --with-deps, unattended upgrades) waits for dpkg's
# lock, up to 10 minutes, rather than failing at once.
echo 'DPkg::Lock::Timeout "600";' | sudo tee /etc/apt/apt.conf.d/90ouro-dpkg-lock > /dev/null

shopt -s nullglob
debs=("$dir"/*.deb)
if [ "${#debs[@]}" -gt 0 ]; then
  # shellcheck disable=SC2024 # the log is the runner's own file
  if sudo dpkg -i "${debs[@]}" > "$dir.log" 2>&1; then
    echo "Installed the browsers' ${#debs[@]} system packages from the cache."
    exit 0
  fi
  echo "The cached system packages did not install (dpkg -i, $dir.log); installing them from the network."
  # Mend what dpkg left half done, and drop the files, so the network install starts clean.
  sudo dpkg --configure -a || true
  sudo apt-get -f install -y || true
  find "$dir" -maxdepth 1 -name '*.deb' -delete
fi

mkdir -p "$dir/partial"
printf 'Dir::Cache::Archives "%s/";\nAPT::Keep-Downloaded-Packages "true";\nBinary::apt::APT::Keep-Downloaded-Packages "true";\n' "$dir" | sudo tee /etc/apt/apt.conf.d/90ouro-browser-debs > /dev/null
# A mirror that stops answering held jobs in "playwright-browsers" for close to an hour (#174's
# queue run 39783627653): a download that stalls fails after a minute and apt tries it again, and
# an install that still hangs is stopped after 15 minutes and run again (scripts/retry.sh). Each
# try first mends what a stopped one left half unpacked, which dpkg would otherwise refuse to
# install over.
printf 'Acquire::http::Timeout "60";\nAcquire::https::Timeout "60";\nAcquire::Retries "3";\n' | sudo tee /etc/apt/apt.conf.d/90ouro-acquire > /dev/null
# shellcheck disable=SC2016 # expanded by the inner shell, once per try
"$here/retry.sh" bash -c 'sudo dpkg --configure -a > /dev/null 2>&1 || true; exec timeout 900 pnpm exec playwright install-deps "$@"' _ "$@"
# apt leaves partial/ to its own user; the cache's tar reads the folder as the runner's.
sudo chmod -R a+rX "$dir"
