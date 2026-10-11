#!/usr/bin/env bash
# The install test: copies test/install-fixture to <app-dir>, runs `shadcn init`, installs
# every Ouro UI item the way an app does, then runs the app's type check, build, the
# shipped Vitest browser tests and the shipped Playwright specs.
#
#   scripts/install-test.sh <shadcn|ouro|github|namespace> <app-dir> [ref]
#
# shadcn: the app keeps the theme `shadcn init` wrote, and a stock shadcn button is added
#         beside Ouro's; both must build.
# ouro:   the app installs the ouro-theme item first, from GitHub at <ref> (default HEAD,
#         which must be pushed).
# github: what a user runs today: `shadcn add ourostack/ouro-ui/<item>` with no ref, so
#         every item and dependency comes from the default branch. Type check, build and
#         the install check only. Meaningful once main has this registry (CI runs it on
#         push to main).
# namespace: the @ouro namespace as Pages serves it (pages.yml): the registry built with
#         @ouro/<item> dependencies, served on localhost and registered in components.json,
#         then `shadcn add @ouro/dialog`. Type check and build.
#
# Same-repo registryDependencies are written without a ref (ourostack/ouro-ui/<item>), so
# shadcn resolves them on the default branch; refs are not inherited. To install this
# commit's items with this commit's dependencies, the script builds a temporary copy of
# the registry whose dependencies point at the locally built item files, and installs
# from those (scripts/registry.mts --deps). Release tags pin them (release.yml).
set -euo pipefail

usage="usage: install-test.sh <shadcn|ouro|github|namespace> <app-dir> [ref]"
variant=${1:?$usage}
app=${2:?$usage}
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

if [ "$variant" = github ]; then
  echo "::group::Every item from GitHub, no ref"
  "${shadcn[@]}" add --yes "${items[@]/#/ourostack/ouro-ui/}"
  echo "::endgroup::"
  echo "::group::Type check and build"
  npx tsc -b
  npx vite build
  node "$root/scripts/install-check.mjs" "$app" shadcn
  echo "::endgroup::"
  exit 0
fi

if [ "$variant" = namespace ]; then
  echo "::group::@ouro/dialog from the namespace, served locally"
  node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "@ouro/{name}"
  "${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"
  python3 -m http.server 8765 --bind 127.0.0.1 --directory "$registry" 2>"$registry/served.log" &
  server=$!
  trap 'kill $server' EXIT
  for _ in $(seq 50); do curl -sf http://127.0.0.1:8765/r/registry.json >/dev/null && break; sleep 0.2; done
  node -e 'const f = "components.json"; const c = JSON.parse(require("fs").readFileSync(f, "utf8"));
    c.registries = { "@ouro": "http://127.0.0.1:8765/r/{name}.json" };
    require("fs").writeFileSync(f, JSON.stringify(c, null, 2) + "\n");'
  "${shadcn[@]}" add --yes @ouro/dialog
  for item in dialog sheet button ouro-lib ouro-testing ouro-base; do
    grep -q "GET /r/$item.json" "$registry/served.log" || { echo "$item did not resolve through @ouro"; exit 1; }
  done
  for path in components/ouro/dialog/dialog.tsx components/ouro/sheet/sheet.tsx components/ouro/button/button.tsx lib/ouro/cn.ts lib/ouro/testing/vitest.ts; do
    test -f "src/$path" || { echo "missing src/$path"; exit 1; }
  done
  grep -q -- "--ouro-spring-duration" src/index.css || { echo "ouro-base did not reach src/index.css"; exit 1; }
  cat > src/App.tsx <<'EOF'
import { Dialog } from "~/components/ouro/dialog/dialog";

export function App() {
  return <Dialog title="Namespace" open onOpenChange={() => {}}>Installed from @ouro.</Dialog>;
}
EOF
  echo "::endgroup::"
  echo "::group::Type check and build"
  npx tsc -b
  npx vite build
  echo "::endgroup::"
  exit 0
fi

echo "::group::Registry copy with local dependencies"
node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "$registry/r/{name}.json"
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
npx playwright install ${CI:+--with-deps} chromium webkit
npx vitest run
echo "::endgroup::"

echo "::group::Shipped Playwright specs"
npx playwright test e2e/ouro
echo "::endgroup::"
