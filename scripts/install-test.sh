#!/usr/bin/env bash
# The install test: copies test/install-fixture (a bare Vite app) to <app-dir>, runs
# `shadcn init`, installs every Ouro UI component the way an app does, and checks that the
# runtime items brought no tests, stories, specs or test tooling: `npx vitest run` finds
# no Ouro tests. Then it adds the testing setup from test/install-fixture-tests (the files
# the ouro-testing message prints) and the ouro-tests item, and runs the app's type check,
# build, the shipped Vitest browser tests and the shipped Playwright specs.
#
#   scripts/install-test.sh <shadcn|ouro|github|namespace|upgrade> <app-dir> [ref]
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
# upgrade: an app on v0.1.0 (every component from GitHub at #v0.1.0, with the test setup
#         the v0.1.0 docs gave) follows "Upgrading from v0.1.0" in README.md literally,
#         against this commit's registry: once keeping the tests (<app-dir>) and once
#         without them (<app-dir>-without-tests). Each must type check and build.
#
# Same-repo registryDependencies are written without a ref (ourostack/ouro-ui/<item>), so
# shadcn resolves them on the default branch; refs are not inherited. To install this
# commit's items with this commit's dependencies, the script builds a temporary copy of
# the registry whose dependencies point at the locally built item files, and installs
# from those (scripts/registry.mts --deps). Release tags pin them (release.yml).
set -euo pipefail

usage="usage: install-test.sh <shadcn|ouro|github|namespace|upgrade> <app-dir> [ref]"
variant=${1:?$usage}
app=${2:?$usage}
root=$(cd "$(dirname "$0")/.." && pwd)
ref=${3:-$(git -C "$root" rev-parse HEAD)}
shadcn=(npx --yes shadcn@4.21.1)
vitest=(npx --yes vitest@5.0.3)
items=(button text heading sheet dialog confirm-dialog)

# The runtime items add components only: no test, story or spec file, no test kit, no test
# tooling in package.json, and so nothing for a plain `vitest run` to find.
runtime_only() {
  node "$root/scripts/install-check.mjs" "$app" "$1" runtime
  local found
  found=$(find src e2e \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' -o -name '*.stories.tsx' -o -name '*.spec.ts' \) 2>/dev/null || true)
  [ -z "$found" ] || { echo "the runtime items added test files:"; echo "$found"; exit 1; }
  local out
  out=$("${vitest[@]}" run --passWithNoTests 2>&1) || { echo "$out"; exit 1; }
  echo "$out"
  grep -q "No test files found" <<<"$out" || { echo "vitest run found tests after a runtime-only install"; exit 1; }
}

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
  runtime_only shadcn
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
  for item in dialog sheet ouro-lib ouro-base; do
    grep -q "GET /r/$item.json" "$registry/served.log" || { echo "$item did not resolve through @ouro"; exit 1; }
  done
  for item in ouro-testing dialog-tests; do
    if grep -q "GET /r/$item.json" "$registry/served.log"; then echo "@ouro/dialog pulled in $item"; exit 1; fi
  done
  for path in components/ouro/dialog/dialog.tsx components/ouro/sheet/sheet.tsx lib/ouro/cn.ts; do
    test -f "src/$path" || { echo "missing src/$path"; exit 1; }
  done
  for path in lib/ouro/testing components/ouro/dialog/dialog.test.tsx components/ouro/dialog/dialog.stories.tsx; do
    if test -e "src/$path"; then echo "@ouro/dialog added src/$path"; exit 1; fi
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

if [ "$variant" = upgrade ]; then
  echo "::group::v0.1.0 from GitHub, with its test setup"
  v010=()
  for item in "${items[@]}"; do v010+=("ourostack/ouro-ui/$item#v0.1.0"); done
  "${shadcn[@]}" add --yes "${v010[@]}"
  cp -R "$root/test/install-fixture-tests/." "$app/"
  # The app works on v0.1.0 before the upgrade.
  npx tsc -b
  npx vite build
  echo "::endgroup::"
fi

echo "::group::Registry copy with local dependencies"
node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "$registry/r/{name}.json"
"${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"
echo "::endgroup::"

if [ "$variant" = upgrade ]; then
  local_items=()
  for item in "${items[@]}"; do local_items+=("$registry/r/$item.json"); done
  bare="$app-without-tests"
  mkdir -p "$bare"
  cp -R "$app/." "$bare/"

  # The steps below are README.md "Upgrading from v0.1.0", with the local registry's
  # item files in place of ourostack/ouro-ui/<item>#v0.2.0.
  self_refs='print unless /^\s*--(color-)?ouro-[\w-]+:\s*var\(--ouro-[\w-]+\);\s*$/'

  echo "::group::Upgrade, keeping the tests"
  "${shadcn[@]}" add --yes "${local_items[@]}" "$registry/r/ouro-tests.json" --overwrite
  perl -i -ne "$self_refs" src/index.css
  npx tsc -b
  npx vite build
  node "$root/scripts/install-check.mjs" "$app" shadcn tests
  echo "::endgroup::"

  echo "::group::Upgrade, without the tests"
  cd "$bare"
  "${shadcn[@]}" add --yes "${local_items[@]}" --overwrite
  find src/components/ouro src/lib/ouro \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' -o -name '*.stories.tsx' \) -delete
  find src/lib/ouro/testing e2e/ouro vitest.config.ts playwright.config.ts .storybook -delete
  npm uninstall storybook @storybook/react-vite vitest @vitest/browser-playwright playwright @playwright/test
  perl -i -ne "$self_refs" src/index.css
  npx tsc -b
  npx vite build
  node "$root/scripts/install-check.mjs" "$bare" shadcn runtime
  echo "::endgroup::"
  exit 0
fi

if [ "$variant" = ouro ]; then
  echo "::group::ouro-theme from GitHub at $ref"
  "${shadcn[@]}" add --yes "ourostack/ouro-ui/ouro-theme#$ref"
  echo "::endgroup::"
fi

echo "::group::Every component, runtime only"
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

echo "::group::Type check, build, and no tests from the runtime items"
npx tsc -b
npx vite build
runtime_only "$variant"
echo "::endgroup::"

echo "::group::The testing setup and ouro-tests"
cp -R "$root/test/install-fixture-tests/." "$app/"
"${shadcn[@]}" add --yes "$registry/r/ouro-tests.json"
npx tsc -b
npx vite build
node "$root/scripts/install-check.mjs" "$app" "$variant" tests
echo "::endgroup::"

echo "::group::Shipped Vitest browser tests"
npx playwright install ${CI:+--with-deps} chromium webkit
npx vitest run
echo "::endgroup::"

echo "::group::Shipped Playwright specs"
npx playwright test e2e/ouro
echo "::endgroup::"
