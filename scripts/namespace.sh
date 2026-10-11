#!/usr/bin/env bash
# Builds the @ouro namespace, the registry Pages serves at /r/, from a release tag: by default
# the newest release, package.json's ouro.latestRelease (scripts/latest-release.mjs). The
# namespace serves released code only; the site and docs build from main.
#
#   scripts/namespace.sh <out-dir> [tag]
#
# It takes the tag's own registry.json (pinned to the tag by release.yml), points every
# same-repo dependency at @ouro/<item> (scripts/registry.mts --from), and runs `shadcn build`
# over the tag's files, so each /r/<item>.json carries that release's code, version and docs.
# Pages runs it (pages.yml), and so does the install test (scripts/install-test.sh namespace).
set -euo pipefail

out=${1:?usage: namespace.sh <out-dir> [tag]}
root=$(cd "$(dirname "$0")/.." && pwd)
tag=${2:-$(node "$root/scripts/latest-release.mjs")}
mkdir -p "$out"
out=$(cd "$out" && pwd)

if ! git -C "$root" rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null; then
  git -C "$root" fetch --quiet --depth=1 origin "refs/tags/$tag:refs/tags/$tag"
fi
src=$(mktemp -d)
git -C "$root" archive "$tag" | tar -x -C "$src"
node -e 'const r = require(process.argv[1]); if (`v${r.version}` !== process.argv[2]) throw new Error(`${process.argv[2]}: registry.json has version ${r.version}, not a release registry`)' "$src/registry.json" "$tag"
node "$root/scripts/registry.mts" --from "$src/registry.json" --out "$src/namespace.json" --deps "@ouro/{name}"
npx --yes shadcn@4.21.1 build "$src/namespace.json" --output "$out" --cwd "$src"
echo "Built the @ouro namespace from $tag in $out ($src holds the tag's files)."
