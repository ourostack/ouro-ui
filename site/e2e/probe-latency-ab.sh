#!/usr/bin/env bash
# PROBE (never merge): Chapter III's controls on four arms, interleaved on one runner:
#   main: main's specs on main's site.  harness: this branch's specs (aimed presses) on main's site.
#   fix: this branch's specs on this branch's site (the squid's arm on its own layer).
#   toasts: fix, with earlier rounds' toasts closed before each set-up.
set -u
mkdir -p probe-out
grep -m1 'model name' /proc/cpuinfo | tee probe-out/cpu.txt
nproc | tee -a probe-out/cpu.txt
BASE=$(git merge-base HEAD origin/main)
echo "base $BASE" | tee -a probe-out/cpu.txt
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
GREP='III interaction latency (encounter-code|orders|saloon-code|again|install|components) answers'
pass() {
  local name=$1 dir=$2; shift 2
  local start=$SECONDS
  (cd "$dir" && env CI= "$@" node_modules/.bin/playwright test --config playwright.latency.config.ts site/e2e/chapter-three.latency.spec.ts --grep "$GREP" --reporter=list) > "probe-out/$name.log" 2>&1
  echo "$name exit $? in $((SECONDS - start)) s"
}
for round in 1 2 3; do
  if [ $((round % 2)) = 1 ]; then
    serve main; pass "main-$round" ../base; pass "harness-$round" .
    serve fix; pass "fix-$round" .; pass "toasts-$round" . PROBE_TOASTS=1
  else
    serve fix; pass "toasts-$round" . PROBE_TOASTS=1; pass "fix-$round" .
    serve main; pass "harness-$round" .; pass "main-$round" ../base
  fi
done
exit 0
