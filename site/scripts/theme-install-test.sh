#!/usr/bin/env bash
# The copy-theme install proof (site-design.md, "Verification in CI"). Builds the clean shadcn app
# scripts/install-test.sh starts from (test/install-fixture, `shadcn init` with the nova preset),
# adds ouro-base, Checklist, Dialog and Button from this commit's registry, and puts in
# test/install-fixture-themes/src/App.tsx, the voyage page's theme sample. Then, for each preset in
# site/src/themes/themes.json, appends the CSS its Copy theme button copies to the app's
# stylesheet and builds the app into <app-dir>/themes/<preset>/. Last, site/theme-install/
# compares the app with the built site (pnpm site:build first) in Chromium.
#
#   site/scripts/theme-install-test.sh <app-dir>
set -euo pipefail

app=${1:?usage: theme-install-test.sh <app-dir>}
root=$(cd "$(dirname "$0")/../.." && pwd)
shadcn=(npx --yes shadcn@4.21.1)
[ -f "$root/site/dist/voyage/index.html" ] || { echo "site/dist has no voyage page: run pnpm site:build first"; exit 1; }

mkdir -p "$app"
app=$(cd "$app" && pwd)
registry="$app/.registry"
mkdir -p "$registry"

echo "::group::Clean shadcn app with Checklist and Dialog"
cp -R "$root/test/install-fixture/." "$app/"
cd "$app"
npm install --no-audit --no-fund
"${shadcn[@]}" init --base base --preset nova --yes --no-monorepo
node "$root/scripts/registry.mts" --out "$registry/registry.json" --deps "$registry/r/{name}.json"
"${shadcn[@]}" build "$registry/registry.json" --output "$registry/r" --cwd "$root"
"${shadcn[@]}" add --yes "$registry/r/ouro-base.json"
"${shadcn[@]}" add --yes "$registry/r/checklist.json" "$registry/r/dialog.json" "$registry/r/button.json"
cp -R "$root/test/install-fixture-themes/." "$app/"
cp src/index.css "$registry/index.css"
npx tsc -b
echo "::endgroup::"

echo "::group::One build per preset, with its copied theme pasted at the end of the stylesheet"
presets=$(node -e 'for (const preset of require(process.argv[1])) console.log(preset.name)' "$root/site/src/themes/themes.json")
for preset in $presets; do
  node -e '
    const fs = require("node:fs");
    const [base, themes, name] = process.argv.slice(1);
    const preset = require(themes).find((candidate) => candidate.name === name);
    fs.writeFileSync("src/index.css", `${fs.readFileSync(base, "utf8")}\n${preset.css.theme}`);
  ' "$registry/index.css" "$root/site/src/themes/themes.json" "$preset"
  npx vite build --base "/app/$preset/" --outDir "themes/$preset" --emptyOutDir --logLevel warn
done
cp "$registry/index.css" src/index.css
echo "::endgroup::"

echo "::group::Compare with the site"
cd "$root"
THEME_APP="$app/themes/" npx playwright test --config site/theme-install/playwright.config.ts
echo "::endgroup::"
