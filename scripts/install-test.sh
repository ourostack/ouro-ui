#!/usr/bin/env bash
# The install test: copies test/install-fixture to <app-dir>, runs `shadcn init`, installs
# every Ouro UI item the way an app does, then runs the app's type check, build, the
# shipped Vitest browser tests and the shipped Playwright specs.
#
#   scripts/install-test.sh <shadcn|ouro> <app-dir> [ref]
#
# shadcn: the app keeps the theme `shadcn init` wrote, and a stock shadcn button is added
#         beside Ouro's; both must build.
# ouro:   the app installs the ouro-theme item first, from GitHub at <ref> (default HEAD,
#         which must be pushed).
#
# Same-repo registryDependencies are written without a ref (ourostack/ouro-ui/<item>), so
# shadcn resolves them on the default branch; refs are not inherited. To install this
# commit's items with this commit's dependencies, the script builds a temporary copy of
# the registry whose dependencies point at the locally built item files, and installs
# from those (scripts/registry.mts --local-deps).
set -euo pipefail

variant=${1:?usage: install-test.sh <shadcn|ouro> <app-dir> [ref]}
app=${2:?usage: install-test.sh <shadcn|ouro> <app-dir> [ref]}
root=$(cd "$(dirname "$0")/.." && pwd)
ref=${3:-$(git -C "$root" rev-parse HEAD)}
shadcn=(npx --yes shadcn@4.21.1)
items=(button text heading sheet dialog confirm-dialog)

mkdir -p "$app"
app=$(cd "$app" && pwd)
registry=$(mktemp -d)

echo "::group::Fixture app"
cp -R "$root/test/install-fixture/." "$app/"
cd "$app"
npm install --no-audit --no-fund
"${shadcn[@]}" init --base base --preset nova --yes --no-monorepo
echo "::endgroup::"

echo "::group::Registry copy with local dependencies"
node "$root/scripts/registry.mts" --out "$registry/registry.json" --local-deps "$registry/r"
"${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"
echo "::endgroup::"

if [ "$variant" = ouro ]; then
  echo "::group::ouro-theme from GitHub at $ref"
  "${shadcn[@]}" add --yes "ourostack/ouro-ui/ouro-theme#$ref"
  echo "::endgroup::"
fi

echo "::group::Every item"
items_json=()
for item in "${items[@]}"; do items_json+=("$registry/r/$item.json"); done
"${shadcn[@]}" add --yes "${items_json[@]}"
echo "::endgroup::"

if [ "$variant" = shadcn ]; then
  echo "::group::Stock shadcn button beside Ouro's"
  "${shadcn[@]}" add --yes button
  cat > src/App.tsx <<'EOF'
import { Button as OuroButton } from "~/components/ouro/button/button";
import { Button } from "~/components/ui/button";

export function App() {
  return (
    <main>
      <Button>shadcn</Button>
      <OuroButton>Ouro</OuroButton>
    </main>
  );
}
EOF
  echo "::endgroup::"
fi

echo "::group::Type check and build"
npx tsc -b
npx vite build
node "$root/scripts/install-check.mjs" "$app" "$variant"
echo "::endgroup::"

echo "::group::Shipped Vitest browser tests"
npx vitest run
echo "::endgroup::"

echo "::group::Shipped Playwright specs"
npx playwright test e2e/ouro
echo "::endgroup::"
