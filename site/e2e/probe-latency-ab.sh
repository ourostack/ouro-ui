#!/usr/bin/env bash
# PROBE (never merge): the whole latency suite, main against this branch, interleaved on one runner.
set -u
mkdir -p probe-out
grep -m1 'model name' /proc/cpuinfo | tee probe-out/cpu.txt
BASE=$(git merge-base HEAD origin/main)
git worktree add -q ../base "$BASE" || exit 1
ln -s "$PWD/node_modules" ../base/node_modules
(cd ../base && node scripts/generate.mjs > /dev/null) || exit 1
build() {
  (cd "$1" && pnpm site:build > "$OLDPWD/probe-out/build-$2.log" 2>&1) || { tail -50 "probe-out/build-$2.log"; exit 1; }
  rm -rf "dist-$2" && cp -r "$1/site/dist" "dist-$2"
}
build . fix
build ../base main
PID=
serve() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null; sleep 1
  rm -rf site/dist && cp -r "dist-$1" site/dist
  node_modules/.bin/vite preview --config site/vite.config.ts --host 127.0.0.1 --port 4179 --strictPort > "probe-out/preview-$1.log" 2>&1 &
  PID=$!
  node -e 'const go = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch("http://127.0.0.1:4179/")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } process.exit(1); }; go();'
}
pass() {
  local name=$1 dir=$2
  local start=$SECONDS
  (cd "$dir" && env CI= node_modules/.bin/playwright test --config playwright.latency.config.ts --reporter=list) > "probe-out/$name.log" 2>&1
  echo "$name exit $? in $((SECONDS - start)) s: $(grep -cE '^latency ' "probe-out/$name.log") controls, $(grep -oE '[0-9]+ failed' "probe-out/$name.log" || echo '0 failed')"
}
for round in 1 2 3; do
  if [ $((round % 2)) = 1 ]; then serve main; pass "main-$round" ../base; serve fix; pass "fix-$round" .
  else serve fix; pass "fix-$round" .; serve main; pass "main-$round" ../base; fi
done
exit 0
