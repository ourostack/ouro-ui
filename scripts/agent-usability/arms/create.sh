#!/usr/bin/env bash
# Creates the app a fresh agent gets for one arm of the agent-usability test: the install
# test's bare Vite app (test/install-fixture) with shadcn's own `@/` alias and a stock Vite
# app's oxlint setup, `shadcn init` with the README's preset, and
#
#   shadcn:       every shadcn/ui component (`shadcn add --all`) and shadcn's llms.txt.
#   shadcn-skill: the same, plus shadcn's official skill, `npx skills add shadcn/ui`, pinned
#                 to a commit of shadcn-ui/ui. It installs two skills into .claude/skills/:
#                 shadcn (SKILL.md, cli.md, customization.md, design-system*.md, mcp.md,
#                 registry.md, rules/, scripts/, evals/, agents/, assets/) and
#                 migrate-radix-to-base, as the unpinned command did on 2026-10-12 (same files).
#   ouro:         every Ouro HX runtime item at a release tag (`shadcn add
#                 ourostack/ouro-ui/<item>#<tag>`) and that tag's llms.txt.
#
#   scripts/agent-usability/arms/create.sh <shadcn|shadcn-skill|ouro> <app-dir>
#
# OURO_REF (default: package.json ouro.latestRelease) and SHADCN_SKILL_REF pick the versions.
# shadcn's own components and llms.txt come from ui.shadcn.com and can't be pinned, so the
# script records the hash of what it got. Everything is recorded in
# <app-dir>/.agent-usability/arm.json, with the hash of every file the app starts with and
# what `tsc -b` and oxlint find in it before any agent runs. The scorer charges an agent only
# for what is not in that baseline, so the script changes none of a library's code.
set -euo pipefail

usage="usage: create.sh <shadcn|shadcn-skill|ouro> <app-dir>"
arm=${1:?$usage}
app=${2:?$usage}
case "$arm" in shadcn | shadcn-skill | ouro) ;; *) echo "$usage"; exit 1 ;; esac
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
shadcn=(npx --yes shadcn@4.21.1)
skills=(npx --yes skills@1.7.0)
skill_ref=${SHADCN_SKILL_REF:-993eb2c3151997ce08a49635c10fd8c8ef3713c7}
ouro_ref=${OURO_REF:-$(node "$root/scripts/latest-release.mjs")}
oxlint=$(node -p 'require(process.argv[1]).devDependencies.oxlint' "$root/package.json")
preset=nova

if [ -e "$app" ] && [ -n "$(ls -A "$app")" ]; then echo "$app is not empty"; exit 1; fi
mkdir -p "$app"
app=$(cd "$app" && pwd)

echo "::group::Vite app and shadcn init"
cp -R "$root/test/install-fixture/." "$app/"
cp "$here/app-readme.md" "$app/README.md"
cd "$app"
node -e '
  const fs = require("node:fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  pkg.name = "cooking-app";
  pkg.scripts = { dev: "vite", build: "tsc -b && vite build", lint: "oxlint src" };
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
perl -pi -e 's{<title>.*</title>}{<title>Cooking app</title>}' index.html
# shadcn's templates and docs import from "@/", so the app does too.
perl -pi -e 's{"~/\*"}{"\@/*"}g' tsconfig.json tsconfig.app.json
perl -pi -e 's{alias: \{ "~":}{alias: \{ "\@":}' vite.config.ts
grep -q '"@/\*"' tsconfig.app.json && grep -q '"@":' vite.config.ts || { echo "the @/ alias was not set"; exit 1; }
cp "$root/scripts/fixtures/vite-oxlint/.oxlintrc.json" .oxlintrc.json
cat >src/App.tsx <<'EOF'
export function App() {
  return <main>The screen goes here.</main>;
}
EOF
npm install --no-audit --no-fund
npm install --no-audit --no-fund --save-dev --save-exact "oxlint@$oxlint"
"${shadcn[@]}" init --base base --preset "$preset" --yes --no-monorepo
echo "::endgroup::"

case "$arm" in
  shadcn | shadcn-skill)
    echo "::group::Every shadcn/ui component"
    "${shadcn[@]}" add --yes --all
    llms=https://ui.shadcn.com/llms.txt
    echo "::endgroup::"
    ;;
  ouro)
    echo "::group::Every Ouro HX component at $ouro_ref"
    raw="https://raw.githubusercontent.com/ourostack/ouro-ui/$ouro_ref"
    # shellcheck disable=SC2207 # item names have no spaces
    items=($(curl -fsSL "$raw/registry.json" | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => { for (const item of JSON.parse(s).items) if (item.type === "registry:ui") console.log(item.name); })'))
    [ "${#items[@]}" -gt 0 ] || { echo "registry.json at $ouro_ref lists no component"; exit 1; }
    addresses=()
    for item in "${items[@]}"; do addresses+=("ourostack/ouro-ui/$item#$ouro_ref"); done
    "${shadcn[@]}" add --yes "ourostack/ouro-ui/ouro-base#$ouro_ref"
    "${shadcn[@]}" add --yes "${addresses[@]}"
    llms="$raw/site/public/llms.txt"
    echo "::endgroup::"
    ;;
esac
curl -fsSL "$llms" -o llms.txt

skill='null'
if [ "$arm" = shadcn-skill ]; then
  echo "::group::shadcn's skill at shadcn-ui/ui@$skill_ref"
  DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 "${skills[@]}" add "https://github.com/shadcn-ui/ui/tree/$skill_ref" --agent claude-code --yes --copy
  test -f .claude/skills/shadcn/SKILL.md || { echo "the skill did not install .claude/skills/shadcn/SKILL.md"; exit 1; }
  skill=$(node -e 'const lock = require("./skills-lock.json"); console.log(JSON.stringify({ command: process.argv[1], lock }))' "${skills[2]} add https://github.com/shadcn-ui/ui/tree/$skill_ref --agent claude-code --yes --copy")
  echo "::endgroup::"
fi

echo "::group::Build and record"
# The app must build. What the type check and the linter find in the untouched app is
# recorded as the arm's baseline (workspace.mts arm-manifest), not fixed: on 2026-10-12
# shadcn's scroll-area.tsx had an unused React import, which fails `tsc -b` under shadcn's own
# template settings.
npx vite build --outDir "$(mktemp -d)"
info=$(node -e '
  const [arm, shadcn, preset, ouroRef, llms, skill] = process.argv.slice(1);
  const crypto = require("node:crypto");
  const fs = require("node:fs");
  const lock = require("./package-lock.json").packages;
  const version = (name) => lock[`node_modules/${name}`]?.version ?? null;
  console.log(JSON.stringify({
    createdAt: new Date().toISOString(),
    node: process.version,
    shadcnCli: shadcn,
    init: `shadcn init --base base --preset ${preset} --yes --no-monorepo`,
    ouroRef: arm === "ouro" ? ouroRef : null,
    llmsTxt: { url: llms, sha256: crypto.createHash("sha256").update(fs.readFileSync("llms.txt")).digest("hex") },
    skill: JSON.parse(skill),
    packages: Object.fromEntries(["react", "@base-ui/react", "tailwindcss", "typescript", "vite", "oxlint"].map((name) => [name, version(name)])),
  }));
' "$arm" "${shadcn[2]#shadcn@}" "$preset" "$ouro_ref" "$llms" "$skill")
node "$root/scripts/agent-usability/workspace.mts" arm-manifest "$app" "$arm" "$info"
echo "::endgroup::"
echo "Created the $arm arm in $app"
