#!/usr/bin/env bash
# Writes what a release commit changes, in this checkout, for v<x.y.z>: the newest release in the
# files `pnpm run docs` keeps on it (scripts/latest-release.mjs), the generated docs, registry.json
# released at that version (scripts/registry.mts --release) and CHANGES.md from changes/*.md. It
# also stages the generated files main does not commit (scripts/generated-files.mjs), registry.json
# among them, so the tag carries what `shadcn add ourostack/ouro-ui/<item>#<tag>` reads.
# release.yml commits the result on the release branch and runs CI on it before the tag exists;
# CI's checks job runs it on every run for the next patch version, whose tag does not exist either
# (the release rehearsal), so a check that needs the release's own tag fails there first.
#
#   scripts/release-commit.sh <x.y.z>
set -euo pipefail

version=${1:?usage: scripts/release-commit.sh <x.y.z>}
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must be x.y.z, without the v (got $version)" >&2; exit 1; }

node scripts/latest-release.mjs set "v$version"
pnpm run docs
node scripts/registry.mts --release "$version"
node scripts/control-matrix.mts
# git ignores them on main; `git commit -a` (release.yml) commits what is staged.
# shellcheck disable=SC2046 # one path per line, no spaces
git add --force -- $(node --input-type=module -e 'import { uncommitted } from "./scripts/generated-files.mjs"; console.log(uncommitted.join("\n"))')
# The tag holds this release's changes, assembled from changes/*.md; main keeps the fragments only.
node scripts/changes.mjs assemble changes > CHANGES.md
