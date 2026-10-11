#!/usr/bin/env bash
# The install test: copies test/install-fixture (a bare Vite app) to <app-dir>, runs
# `shadcn init`, installs every Ouro UI component the way an app does, and checks that the
# runtime items brought no tests, stories, specs or test tooling: `npx vitest run` finds
# no Ouro tests. Then it adds the testing setup from test/install-fixture-tests (the files
# the ouro-testing message prints) and the ouro-tests item, and runs the app's type check,
# build, the shipped Vitest browser tests and the shipped Playwright specs.
#
#   scripts/install-test.sh <shadcn|ouro|github|namespace|next|upgrade> <app-dir> [ref]
#
# shadcn: the app keeps the theme `shadcn init` wrote, and a stock shadcn button is added
#         beside Ouro's; both must build.
# shadcn and ouro also raise --ouro-layer the way the README says, re-add an item, and check
#         that the override still wins.
# ouro:   the app installs the ouro-theme item first, from GitHub at <ref> (default HEAD,
#         which must be pushed).
# github: what a user runs today: `shadcn add ourostack/ouro-ui/<item>` with no ref, so
#         every item and dependency comes from the default branch. Type check, build and
#         the install check only. Meaningful once main has this registry (CI runs it on
#         push to main).
# namespace: the @ouro namespace as Pages serves it (pages.yml): built from the newest release
#         tag (package.json ouro.latestRelease) by scripts/namespace.sh, served on localhost and
#         registered in components.json, then `shadcn add @ouro/dialog`. Every dependency must
#         come through @ouro, every installed file must equal the tag's source, and each item
#         must name that release. Type check and build.
# next:   a Next.js App Router app from create-next-app (TypeScript, Tailwind CSS v4, src/),
#         `shadcn init` (which writes "rsc": true), every runtime item, and a Server Component
#         page that renders every component; `next build` must pass and prerender it, and
#         every installed file keeps its source's "use client".
# upgrade: an app on v0.1.0 (dialog from GitHub at #v0.1.0, which brought button and sheet,
#         with the v0.1.0 test setup and a test of its own, test/install-fixture-upgrade)
#         runs UPGRADING.md's commands against this commit's registry. In an app/ layout
#         (<app-dir>-app-layout): step 1 on an app with no Ouro component must stop before
#         adding anything; then steps 1 to 3. In the src/ layout: steps 1 and 2 in <app-dir>,
#         steps 1 to 3 in <app-dir>-without-tests. Each must type check, build, keep the app's
#         own test and config, add no component and keep no v0.1.0 token line.
#
# Same-repo registryDependencies are written without a ref (ourostack/ouro-ui/<item>), so
# shadcn resolves them on the default branch; refs are not inherited. To install this
# commit's items with this commit's dependencies, the script builds a temporary copy of
# the registry whose dependencies point at the locally built item files, and installs
# from those (scripts/registry.mts --deps). Release tags pin them (release.yml).
set -euo pipefail

usage="usage: install-test.sh <shadcn|ouro|github|namespace|next|upgrade> <app-dir> [ref]"
variant=${1:?$usage}
app=${2:?$usage}
root=$(cd "$(dirname "$0")/.." && pwd)
ref=${3:-$(git -C "$root" rev-parse HEAD)}
shadcn=(npx --yes shadcn@4.21.1)
# The README's init uses --preset nova. OURO_PRESET runs the same test with another of
# shadcn's presets (CI runs vega too), so the docs can say which presets are verified.
preset=${OURO_PRESET:-nova}
vitest=(npx --yes vitest@5.0.3)
create_next_app=(npx --yes create-next-app@16.3.8)
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

if [ "$variant" = next ]; then
  echo "::group::Next.js App Router app"
  # create-next-app accepts the empty folder made above.
  "${create_next_app[@]}" "$app" --ts --tailwind --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
  cd "$app"
  "${shadcn[@]}" init --base base --preset "$preset" --yes --no-monorepo
  node -e 'if (require("./components.json").rsc !== true) throw new Error("shadcn init did not set rsc: true")'
  echo "::endgroup::"

  echo "::group::Every component, runtime only"
  node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "$registry/r/{name}.json"
  "${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"
  items_json=()
  for item in "${items[@]}"; do items_json+=("$registry/r/$item.json"); done
  "${shadcn[@]}" add --yes "${items_json[@]}"
  echo "::endgroup::"

  echo "::group::Every component from a Server Component page"
  # No "use client" here: app/page.tsx is a Server Component by default. Props cross to the
  # client components, so they are serializable: elements, strings, and a server action for
  # ConfirmDialog's onConfirm.
  cat > src/app/page.tsx <<'PAGE'
import { Button } from "@/components/ouro/button/button";
import { ConfirmDialog } from "@/components/ouro/dialog/confirm-dialog";
import { Dialog } from "@/components/ouro/dialog/dialog";
import { Sheet } from "@/components/ouro/sheet/sheet";
import { Heading } from "@/components/ouro/text/heading";
import { Text } from "@/components/ouro/text/text";
import { OuroProvider } from "@/lib/ouro/ouro-provider";

async function deleteRecipe() {
  "use server";
}

export default function Page() {
  return (
    <OuroProvider>
      <main>
        <Heading level={1}>Ouro server page</Heading>
        <Text>Rendered by a Server Component.</Text>
        <Button>Ouro button</Button>
        <Button href="/recipes">Ouro link</Button>
        <Dialog title="Edit recipe" trigger={<Button>Open dialog</Button>}>
          <Text>Dialog body</Text>
        </Dialog>
        <Sheet title="Filters" trigger={<Button>Open sheet</Button>}>
          <Text>Sheet body</Text>
        </Sheet>
        <ConfirmDialog
          title="Delete recipe?"
          confirmLabel="Delete"
          tone="destructive"
          onConfirm={deleteRecipe}
          trigger={<Button tone="destructive">Delete</Button>}
        />
      </main>
    </OuroProvider>
  );
}
PAGE
  echo "::endgroup::"

  echo "::group::Type check, next build, and the install check"
  npx tsc --noEmit
  npx next build
  html=.next/server/app/index.html
  for text in "Ouro server page" "Rendered by a Server Component." "Ouro button" "Ouro link" "Open dialog" "Open sheet" "Delete"; do
    grep -q "$text" "$html" || { echo "the prerendered page has no \"$text\""; exit 1; }
  done
  node "$root/scripts/install-check.mjs" "$app" next runtime
  echo "::endgroup::"
  exit 0
fi

echo "::group::Fixture app"
cp -R "$root/test/install-fixture/." "$app/"
cd "$app"
npm install --no-audit --no-fund
"${shadcn[@]}" init --base base --preset "$preset" --yes --no-monorepo
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
  tag=$(node "$root/scripts/latest-release.mjs")
  "$root/scripts/namespace.sh" "$registry/r" "$tag"
  for item in dialog sheet ouro-lib ouro-base; do
    node -e 'const i = require(process.argv[1]); if (!i.docs.endsWith(` Ouro UI ${process.argv[2]}.`)) throw new Error(`${i.name} does not name ${process.argv[2]}: ${i.docs.slice(-40)}`)' "$registry/r/$item.json" "${tag#v}"
  done
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
  # What @ouro served is the release: every installed file equals the tag's source.
  mkdir -p "$registry/tag"
  git -C "$root" archive "$tag" | tar -x -C "$registry/tag"
  node "$root/scripts/install-check.mjs" --sources "$app" "$registry/tag"
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

if [ "$variant" = upgrade ]; then
  # Runs step <n> of UPGRADING.md, the note README.md, the site and the release notes show,
  # exactly as written, except that each ourostack/ouro-ui/<item>#v0.2.0 address is this
  # commit's built item file and the CLI is pinned and non-interactive.
  note_step() {
    node "$root/scripts/upgrade-note.mjs" commands "$1" --shadcn "${shadcn[*]}" --address "$registry/r/{name}.json" >"$registry/step-$1.sh"
    bash -ex "$registry/step-$1.sh"
  }
  # Moves the app in the current folder from src/ to app/, the layout Spoonjoy uses: the
  # folder and every config path, so the ~/* alias points at ./app/*.
  to_app_layout() {
    if [ -d src ]; then
      mkdir -p app
      cp -R src/. app/
      mv src "$(mktemp -d)/"
    fi
    local file
    for file in tsconfig.json tsconfig.app.json vite.config.ts index.html vitest.config.ts .storybook/main.ts components.json; do
      if [ -f "$file" ]; then perl -pi -e 's{(["/.])src/}{$1app/}g; s{"src"}{"app"}g; s{"\./src"}{"./app"}g' "$file"; fi
    done
  }
  # Makes the app in the current folder a v0.1.0 app: dialog from GitHub at #v0.1.0 (which
  # brings button and sheet), the v0.1.0 test setup, and a test and Vitest project of its own.
  # <base> is the layout's folder (src or app).
  v010_app() {
    "${shadcn[@]}" add --yes "ourostack/ouro-ui/dialog#v0.1.0"
    cp -R "$root/test/install-fixture-tests/." .
    cp -R "$root/test/install-fixture-upgrade/." .
    if [ "$1" = app ]; then to_app_layout; fi
    npx tsc -b
    npx vite build
    npx vitest run --project app
    local found
    found=$(ls "$1/components/ouro" | tr '\n' ' ')
    [ "$found" = "button dialog sheet " ] || { echo "v0.1.0 dialog installed: $found"; exit 1; }
  }
  # After an upgrade: the app type checks, builds and runs its own test with its own config;
  # it has the same Ouro components as before; no v0.1.0 @theme inline token line
  # (`--ouro-x: var(--ouro-x);`, `--color-ouro-backdrop-color: var(--ouro-backdrop-color);`)
  # is left in the CSS file components.json names. <base> is the layout's folder.
  upgraded() {
    npx tsc -b
    npx vite build
    grep -q 'name: "app"' vitest.config.ts || { echo "the upgrade removed the app's Vitest project"; exit 1; }
    npx vitest run --project app
    local now css
    now=$(ls "$1/components/ouro" | tr '\n' ' ')
    [ "$now" = "button dialog sheet " ] || { echo "the upgrade changed the component folders: $now"; exit 1; }
    css=$(node -p 'require("./components.json").tailwind.css')
    if grep -En -- '^[[:space:]]*--(color-)?ouro-[a-z-]+:[[:space:]]*var\(--ouro-[a-z-]+\);' "$css"; then
      echo "$css still maps an Ouro token through @theme inline"; exit 1
    fi
  }
  # After step 3: no Ouro test, story or spec file and no test kit is left.
  no_ouro_tests() {
    local left
    left=$(find "$1/components/ouro" "$1/lib/ouro" e2e \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.test-d.ts' -o -name '*.stories.tsx' -o -name '*.spec.ts' \) 2>/dev/null || true)
    [ -z "$left" ] || { echo "step 3 left Ouro test files:"; echo "$left"; exit 1; }
    test ! -e "$1/lib/ouro/testing" || { echo "step 3 left $1/lib/ouro/testing"; exit 1; }
  }
  # Step 3's prose: remove the ouroTestProjects import and call from the Vitest config.
  drop_ouro_projects() {
    grep -v ouroTestProjects vitest.config.ts >vitest.config.next.ts
    mv vitest.config.next.ts vitest.config.ts
  }

  echo "::group::app/ layout: a fresh app with ~/* aliases on ./app/*"
  layout="$app-app-layout"
  mkdir -p "$layout"
  cp -R "$root/test/install-fixture/." "$layout/"
  cd "$layout"
  to_app_layout
  npm install --no-audit --no-fund
  "${shadcn[@]}" init --base base --preset "$preset" --yes --no-monorepo
  node -e 'const c = require("./components.json"); if (!c.tailwind.css.startsWith("app/")) throw new Error(`components.json css is ${c.tailwind.css}`)'
  echo "::endgroup::"

  echo "::group::Step 1 stops when it finds no Ouro component"
  cp package.json "$registry/package.before.json"
  if note_step 1 >"$registry/empty.log" 2>&1; then cat "$registry/empty.log"; echo "step 1 ran in an app with no Ouro components"; exit 1; fi
  cat "$registry/empty.log"
  grep -q "No Ouro components in .*/app/components/ouro" "$registry/empty.log" || { echo "step 1 did not say why it stopped"; exit 1; }
  if grep -q " add " "$registry/empty.log"; then echo "step 1 called shadcn add"; exit 1; fi
  test ! -e app/components/ouro && test ! -e app/lib/ouro || { echo "step 1 changed the app"; exit 1; }
  cmp -s package.json "$registry/package.before.json" || { echo "step 1 changed package.json"; exit 1; }
  echo "::endgroup::"

  echo "::group::app/ layout: v0.1.0, then steps 1 to 3"
  v010_app app
  note_step 1
  note_step 2
  note_step 3
  drop_ouro_projects
  upgraded app
  no_ouro_tests app
  echo "::endgroup::"

  echo "::group::src/ layout: v0.1.0"
  cd "$app"
  v010_app src
  bare="$app-without-tests"
  mkdir -p "$bare"
  cp -R "$app/." "$bare/"
  echo "::endgroup::"

  echo "::group::src/ layout: steps 1 and 2, keeping the tests"
  note_step 1
  note_step 2
  upgraded src
  for path in components/ouro/dialog/dialog.test.tsx components/ouro/sheet/sheet.stories.tsx lib/ouro/testing/vitest.ts; do
    test -f "src/$path" || { echo "the upgrade did not keep src/$path"; exit 1; }
  done
  echo "::endgroup::"

  echo "::group::src/ layout: steps 1 to 3, without Ouro's tests"
  cd "$bare"
  note_step 1
  note_step 2
  note_step 3
  drop_ouro_projects
  upgraded src
  no_ouro_tests src
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

# The README's way to raise --ouro-layer: a :root rule of the app's own, after the Ouro tokens
# and outside any @layer. A later `shadcn add` rewrites the --ouro-layer line it wrote, but must
# leave this rule as the winning declaration. The shipped tests below then run with it.
echo "::group::An --ouro-layer override survives a re-add"
printf '\n:root {\n  --ouro-layer: 60;\n}\n' >>src/index.css
"${shadcn[@]}" add --yes --overwrite "$registry/r/sheet.json"
node "$root/scripts/install-check.mjs" --layer-override src/index.css 60
npx vite build
grep -q -- "--ouro-layer:60" dist/assets/*.css || { echo "the built CSS lost the --ouro-layer override"; exit 1; }
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
