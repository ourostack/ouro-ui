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
# Every variant adds ouro-base first, once, as the README says: no component installs it.
#
# shadcn: the app keeps the theme `shadcn init` wrote, without its field border color and
#         radius scale (--input, --radius and their @theme mappings are stripped before
#         ouro-base is added, to stand for a theme that has neither; ouro-base must add them,
#         and the shipped text-field spec measures the border). A stock shadcn button is added
#         beside Ouro's; both must build.
# shadcn and ouro then make the app's own setup (a rule of its own in the stylesheet, which
#         raises --ouro-layer the way the README says, and its test tools pinned to exact
#         versions in package.json), add two more items, a component again with --overwrite and
#         a tests item, and check that the stylesheet and package.json are byte for byte what
#         they were: a later add never undoes an app's setup.
# ouro:   the app installs the ouro-theme item first, from GitHub at <ref> (default HEAD,
#         which must be pushed).
# github: what a user runs today: `shadcn add ourostack/ouro-ui/<item>` with no ref, so
#         every item and dependency comes from the default branch. Type check, build and
#         the install check only. Meaningful once main has this registry (CI runs it on
#         push to main).
# namespace: the @ouro namespace as Pages serves it (pages.yml): built from the newest release
#         tag (package.json ouro.latestRelease) by scripts/namespace.sh, served on localhost and
#         registered in components.json, then `shadcn add @ouro/ouro-base @ouro/dialog`. Every
#         dependency of dialog in that release (read from the built items, so the test holds
#         for a release before and after the helpers became one item each) must come through
#         @ouro, every installed file must equal the tag's source, and each item must name
#         that release. Type check and build.
# next:   a Next.js App Router app from create-next-app (TypeScript, Tailwind CSS v4, src/),
#         `shadcn init` (which writes "rsc": true), every runtime item, and test/install-fixture-next:
#         a Server Component layout with the README's providers.tsx (<OuroProvider
#         linkComponent={Link}>, next/link) and a Server Component page that renders every
#         component and the Dialog, Sheet and Field parts; `next build` must pass and prerender it, and
#         every installed file keeps its source's "use client".
# upgrade: an app on v0.1.0 (dialog from GitHub at #v0.1.0, which brought button and sheet,
#         with the v0.1.0 test setup and a test of its own, test/install-fixture-upgrade)
#         runs UPGRADING.md's commands against this commit's registry. In an app/ layout
#         (<app-dir>-app-layout): step 1 on an app with no Ouro component must stop before
#         adding anything; then steps 1 to 3. In the src/ layout: steps 1 and 2 in <app-dir>,
#         steps 1 to 3 in <app-dir>-without-tests. Each must type check, build, keep the app's
#         own test and config, add no component and keep no v0.1.0 token line.
#
# shadcn and ouro end with the shipped tests. Two settings let CI split and narrow that run
# (.github/workflows/ci.yml); the install, type check and build before it always run in full:
#   OURO_SHARD=<index>/<count>  runs only that shard of the shipped Vitest files and Playwright specs.
#   OURO_BROWSER_DEPS           a file that receives the exit status of a background install of the
#                               browsers' system packages: the shipped tests wait for it.
#   OURO_COMPONENTS             set (maybe empty) on a pull request's reduced run: the shipped tests
#                               of those components' folders and their specs, or none when it is
#                               empty (scripts/test-impact.mjs). Unset: every shipped test.
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
# The pinned CLI, or SHADCN_VERSION (CI's install-latest job sets "latest" on a release branch,
# so a release is tagged only when every item also installs with the newest shadcn).
shadcn=(npx --yes shadcn@4.21.1)
[ -z "${SHADCN_VERSION:-}" ] || shadcn=(npx --yes "shadcn@$SHADCN_VERSION")
# The README's init uses --preset nova. OURO_PRESET runs the same test with another of
# shadcn's presets (CI runs vega too), so the docs can say which presets are verified.
preset=${OURO_PRESET:-nova}
vitest=(npx --yes vitest@5.0.3)
create_next_app=(npx --yes create-next-app@16.3.8)
# Every component's runtime item (type registry:ui), in registry order, from this commit's registry.json.
# shellcheck disable=SC2207 # item names have no spaces
items=($(node -e 'for (const item of require(process.argv[1]).items) if (item.type === "registry:ui") console.log(item.name)' "$root/registry.json"))
[ "${#items[@]}" -gt 0 ] || { echo "registry.json lists no component"; exit 1; }

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

  node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "$registry/r/{name}.json"
  "${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"

  echo "::group::The README's steps for a Next.js app, exactly: ouro-base, dialog, then OuroProvider by name and its two files"
  # scripts/readme-steps.mjs reads the add commands and the two files from README.md, so this
  # builds what a reader builds. dialog brings no OuroProvider, which is why the README adds
  # lib-ouro-provider by name; without that step the build fails on the provider's import.
  while IFS= read -r names; do
    step=()
    for name in $names; do step+=("$registry/r/$name.json"); done
    "${shadcn[@]}" add --yes "${step[@]}"
  done < <(node -e 'for (const names of JSON.parse(process.argv[1])) console.log(names.join(" "))' "$(node "$root/scripts/readme-steps.mjs")")
  test -f src/lib/ouro/ouro-provider.tsx || { echo "the README's steps did not install OuroProvider"; exit 1; }
  node "$root/scripts/readme-steps.mjs" write "$app"
  npx tsc --noEmit
  npx next build
  echo "::endgroup::"

  echo "::group::Every component, runtime only"
  # ouro-base is in the app already, from the README's steps above.
  items_json=()
  for item in "${items[@]}"; do items_json+=("$registry/r/$item.json"); done
  "${shadcn[@]}" add --yes "${items_json[@]}"
  echo "::endgroup::"

  echo "::group::Every component from Server Components"
  # test/install-fixture-next: app/layout.tsx, app/page.tsx and the sections in
  # app/sections/<item>.tsx are Server Components (no "use client"). Each component's section
  # renders it (and its parts) with serializable props (elements, strings, a server action for
  # ConfirmDialog's onConfirm), and its `// expect: <pattern>` lines say what the prerendered
  # page must hold (grep basic regular expressions). The page renders app/sections/index.ts,
  # which this script writes from the section files. The layout wraps the app in
  # app/providers.tsx, the client file the README gives Next.js apps for
  # <OuroProvider linkComponent={Link}>, because next/link's Link can't cross from a Server
  # Component.
  cp -R "$root/test/install-fixture-next/." "$app/"
  for item in "${items[@]}"; do
    [ -f "src/app/sections/$item.tsx" ] || { echo "test/install-fixture-next/src/app/sections/$item.tsx is missing: every component renders from a Server Component section"; exit 1; }
  done
  node -e '
    const fs = require("node:fs");
    const names = fs.readdirSync("src/app/sections").filter((file) => file.endsWith(".tsx")).map((file) => file.slice(0, -4)).sort();
    const imports = names.map((name, index) => `import Section${index} from "./${name}";`);
    const list = names.map((name, index) => `  { name: "${name}", Section: Section${index} },`);
    fs.writeFileSync("src/app/sections/index.ts", `${imports.join("\n")}\n\nexport const sections = [\n${list.join("\n")}\n];\n`);
  '
  echo "::endgroup::"

  echo "::group::Type check, next build, and the install check"
  npx tsc --noEmit
  npx next build
  html=.next/server/app/index.html
  for section in src/app/sections/*.tsx; do
    patterns=$(sed -n 's|^// expect: ||p' "$section")
    [ -n "$patterns" ] || { echo "$section has no // expect: line"; exit 1; }
    while IFS= read -r pattern; do
      grep -q -- "$pattern" "$html" || { echo "the prerendered page has no \"$pattern\" ($section)"; exit 1; }
    done <<<"$patterns"
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
  "${shadcn[@]}" add --yes ourostack/ouro-ui/ouro-base "${items[@]/#/ourostack/ouro-ui/}"
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
  "$root/scripts/namespace.sh" "$registry/r" "$tag" "$registry/tag"
  # ouro-base and everything dialog installs in this release, from the built items.
  # shellcheck disable=SC2207 # item names have no spaces
  closure=($(node -e '
    const dir = process.argv[1];
    const seen = new Set();
    const visit = (name) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const dep of require(dir + "/" + name + ".json").registryDependencies ?? []) {
        if (!dep.startsWith("@ouro/")) throw new Error(name + " depends on " + dep + ", outside the namespace");
        visit(dep.slice(6));
      }
    };
    visit("ouro-base");
    visit("dialog");
    console.log([...seen].join("\n"));
  ' "$registry/r"))
  for item in "${closure[@]}"; do
    # An item with a message names the release it came from (a helper has no message).
    node -e 'const i = require(process.argv[1]); if (i.docs && !i.docs.endsWith(` Ouro UI ${process.argv[2]}.`)) throw new Error(`${i.name} does not name ${process.argv[2]}: ${i.docs.slice(-40)}`)' "$registry/r/$item.json" "$tag"
  done
  python3 -m http.server 8765 --bind 127.0.0.1 --directory "$registry" 2>"$registry/served.log" &
  server=$!
  trap 'kill $server' EXIT
  for _ in $(seq 50); do curl -sf http://127.0.0.1:8765/r/registry.json >/dev/null && break; sleep 0.2; done
  node -e 'const f = "components.json"; const c = JSON.parse(require("fs").readFileSync(f, "utf8"));
    c.registries = { "@ouro": "http://127.0.0.1:8765/r/{name}.json" };
    require("fs").writeFileSync(f, JSON.stringify(c, null, 2) + "\n");'
  "${shadcn[@]}" add --yes @ouro/ouro-base @ouro/dialog
  for item in "${closure[@]}"; do
    grep -q "GET /r/$item.json" "$registry/served.log" || { echo "$item did not resolve through @ouro"; exit 1; }
  done
  if grep -E "GET /r/(ouro-testing|[a-z0-9-]+-tests)\.json" "$registry/served.log"; then echo "@ouro/dialog pulled in a tests item"; exit 1; fi
  for path in components/ouro/dialog/dialog.tsx components/ouro/sheet/sheet.tsx lib/ouro/cn.ts; do
    test -f "src/$path" || { echo "missing src/$path"; exit 1; }
  done
  for path in lib/ouro/testing components/ouro/dialog/dialog.test.tsx components/ouro/dialog/dialog.stories.tsx; do
    if test -e "src/$path"; then echo "@ouro/dialog added src/$path"; exit 1; fi
  done
  grep -q -- "--ouro-spring-duration" src/index.css || { echo "ouro-base did not reach src/index.css"; exit 1; }
  # What @ouro served is the release: every installed file equals the tag's source.
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

echo "::group::ouro-base, once"
if [ "$variant" = shadcn ]; then
  # A theme with no field border color and no radius scale: ouro-base must add them.
  node "$root/scripts/install-check.mjs" --strip-field-tokens src/index.css
fi
"${shadcn[@]}" add --yes "$registry/r/ouro-base.json"
echo "::endgroup::"

echo "::group::Every component, runtime only"
# No component depends on ouro-base, so this add must leave the stylesheet as it is.
cp src/index.css "$registry/index.after-base.css"
items_json=()
for item in "${items[@]}"; do items_json+=("$registry/r/$item.json"); done
"${shadcn[@]}" add --yes "${items_json[@]}"
cmp src/index.css "$registry/index.after-base.css" || { echo "adding the components changed src/index.css"; diff "$registry/index.after-base.css" src/index.css || true; exit 1; }
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

if [ "$variant" = shadcn ]; then
  # The React Router adapter the OuroProvider page prints, as an app copies it (with its own
  # alias for "@/"), type checked against React Router itself. --no-save leaves package.json
  # alone for the byte comparison below.
  echo "::group::The OuroProvider page's React Router adapter"
  npm install --no-save --no-audit --no-fund react-router@7.9.4
  node "$root/scripts/readme-steps.mjs" write-router "$app" "~/"
  npx tsc -b
  mv src/root.tsx src/components/ouro-router-link.tsx "$registry/"
  echo "::endgroup::"
fi

# The app's own setup, made after the first install: a rule of its own in the stylesheet (the
# README's way to raise --ouro-layer: a :root rule after the Ouro tokens, outside any @layer)
# and its test tools pinned to exact versions in package.json, here the versions this
# repository runs. Then two more items: a component again with --overwrite (how an app
# updates one) and a tests item. Neither file may change by a byte: no item but ouro-base
# carries CSS, and a tests item names its tools without a version, so the CLI leaves a tool
# the app already has alone. The shipped tests below then run with this setup.
echo "::group::Later adds leave the app's stylesheet and package.json alone"
printf '\n:root {\n  --ouro-layer: 60;\n}\n\n/* The app'"'"'s own rule. */\n.app-own {\n  color: rebeccapurple;\n}\n' >>src/index.css
node -e '
  const fs = require("node:fs");
  const ours = require(process.argv[1]).devDependencies;
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  for (const name of ["@playwright/test", "@storybook/react-vite", "@vitest/browser-playwright", "playwright", "storybook", "vitest"]) {
    pkg.devDependencies[name] = ours[name].replace(/^[\^~]/, "");
  }
  pkg.devDependencies = Object.fromEntries(Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
' "$root/package.json"
npm install --no-audit --no-fund
cp src/index.css "$registry/index.before.css"
cp package.json "$registry/package.before.json"
"${shadcn[@]}" add --yes --overwrite "$registry/r/sheet.json" "$registry/r/button-tests.json"
cmp src/index.css "$registry/index.before.css" || { echo "a later add changed src/index.css"; diff "$registry/index.before.css" src/index.css || true; exit 1; }
cmp package.json "$registry/package.before.json" || { echo "a later add changed package.json"; diff "$registry/package.before.json" package.json || true; exit 1; }
test -f src/components/ouro/button/button.test.tsx || { echo "button-tests was not installed"; exit 1; }
node "$root/scripts/install-check.mjs" --layer-override src/index.css 60
npx vite build
grep -q -- "--ouro-layer:60" dist/assets/*.css || { echo "the built CSS lost the --ouro-layer override"; exit 1; }
echo "::endgroup::"

echo "::group::The testing setup and ouro-tests"
cp -R "$root/test/install-fixture-tests/." "$app/"
"${shadcn[@]}" add --yes "$registry/r/ouro-tests.json"
cmp src/index.css "$registry/index.before.css" || { echo "ouro-tests changed src/index.css"; diff "$registry/index.before.css" src/index.css || true; exit 1; }
# The pinned tools keep their versions; ouro-tests may add only tools the app lacked.
node -e '
  const before = require(process.argv[1]).devDependencies;
  const after = require("./package.json").devDependencies;
  const changed = Object.keys(before).filter((name) => after[name] !== before[name]);
  if (changed.length > 0) throw new Error("ouro-tests changed the version of " + changed.map((name) => name + " (" + before[name] + " to " + after[name] + ")").join(", "));
' "$registry/package.before.json"
npx tsc -b
npx vite build
node "$root/scripts/install-check.mjs" "$app" "$variant" tests
echo "::endgroup::"

# The shipped tests to run: every one, or a reduced run's (OURO_COMPONENTS), in one shard (OURO_SHARD).
vitest_filters=()
spec_filters=(e2e/ouro)
if [ -n "${OURO_COMPONENTS+set}" ]; then
  if [ -z "$OURO_COMPONENTS" ]; then
    echo "Reduced run with no component selected: this change cannot affect a shipped test, so none runs here."
    exit 0
  fi
  # Vitest and Playwright take path filters: each selected folder's tests and each selected stem's spec.
  # shellcheck disable=SC2207 # folder and spec names have no spaces
  vitest_filters=($(node "$root/scripts/test-impact.mjs" stories "$OURO_COMPONENTS" | tr ',' '\n' | sed 's|^\(.*\)$|components/ouro/\1/|'))
  # shellcheck disable=SC2207
  spec_filters=($(node "$root/scripts/test-impact.mjs" e2e "$OURO_COMPONENTS" | tr ' ' '\n' | sed -n 's|^registry/ouro/\(e2e/ouro/.*\.spec\.ts\)$|\1|p'))
  echo "Reduced run: the shipped tests of ${vitest_filters[*]:-no folder} and the specs ${spec_filters[*]:-(none)}."
fi
shard=()
[ -z "${OURO_SHARD:-}" ] || shard=(--shard="$OURO_SHARD")

# CI installs the browsers' system packages in the background while it builds the app
# (OURO_BROWSER_DEPS names the file their exit status lands in): wait for them, at most 15
# minutes, and add them here only if that failed.
deps=(${CI:+--with-deps})
if [ -n "${OURO_BROWSER_DEPS:-}" ]; then
  for _ in $(seq 450); do [ -s "$OURO_BROWSER_DEPS" ] && break; sleep 2; done
  if [ "$(cat "$OURO_BROWSER_DEPS" 2>/dev/null)" = 0 ]; then deps=(); else echo "The background install of the browsers' system packages did not finish; installing them here."; fi
fi

echo "::group::Shipped Vitest browser tests"
npx playwright install ${deps[@]+"${deps[@]}"} chromium webkit
npx vitest run --passWithNoTests ${shard[@]+"${shard[@]}"} ${vitest_filters[@]+"${vitest_filters[@]}"}
echo "::endgroup::"

echo "::group::Shipped Playwright specs"
if [ "${#spec_filters[@]}" -gt 0 ]; then
  npx playwright test --pass-with-no-tests ${shard[@]+"${shard[@]}"} "${spec_filters[@]}"
else
  echo "No selected component has a spec."
fi
echo "::endgroup::"
