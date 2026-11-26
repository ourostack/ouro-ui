#!/bin/bash
# Makes a lane's worktree whose node_modules is cloned from one shared pnpm store, so a lane costs its checkout, not another copy of every package.
# Usage: bash scripts/lane.sh new <name> [ref] | reimport [dir...] | rm <name> | browser <command> (contributing/testing.md)
# The setting is passed by environment for this install only: never write the global ~/.npmrc, which holds the package feed proxy.
set -euo pipefail
root=$(git rev-parse --path-format=absolute --git-common-dir | sed 's|/\.git$||')
lanes=${OURO_LANES:-$(dirname "$root")/_lane}
export npm_config_package_import_method=clone
export npm_config_store_dir=${OURO_STORE:-$HOME/Library/pnpm/store/v10}
free() { df -k "$root" | awk 'NR==2{print $4}'; }
install() { (cd "$1" && pnpm install --offline --frozen-lockfile --ignore-scripts); }
case ${1:-} in
  new)
    before=$(free)
    git -C "$root" fetch -q origin
    git -C "$root" worktree add -q --detach "$lanes/$2" "${3:-origin/main}"
    install "$lanes/$2"
    echo "lane $2: $(( (before - $(free)) / 1024 )) MB of free space used (df, not du: du counts clones in full)"
    ;;
  reimport)
    shift
    before=$(free)
    [ $# -gt 0 ] || set -- "$lanes"/*/
    for dir in "$@"; do
      [ -d "$dir/node_modules" ] && [ ! -L "$dir/node_modules" ] || continue
      rm -rf "$dir/node_modules" && install "$dir"
    done
    echo "reimported: $(( ($(free) - before) / 1024 )) MB of free space gained (df)"
    ;;
  rm)
    # Run it in the step that merges or closes the lane's pull request.
    git -C "$root" worktree remove --force "$lanes/$2"
    ;;
  browser)
    # One browser suite at a time on the machine. macOS has no flock, so mkdir is the lock and its pid file says whose it is.
    shift
    lock=$lanes/.browser.lock
    until mkdir "$lock" 2>/dev/null; do
      holder=$(cat "$lock/pid" 2>/dev/null || true)
      if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then rm -rf "$lock"; continue; fi
      echo "lane browser: waiting for pid ${holder:-?}'s browser suite" >&2
      sleep 5
    done
    trap 'rm -rf "$lock"' EXIT INT TERM
    echo $$ > "$lock/pid"
    "$@"
    ;;
  *) echo "usage: lane.sh new <name> [ref] | reimport [dir...] | rm <name> | browser <command>" >&2; exit 2 ;;
esac
