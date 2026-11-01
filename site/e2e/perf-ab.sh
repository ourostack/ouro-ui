#!/usr/bin/env bash
# PROBE (never merge): museum and organ on main (base) and on this branch (v1), and on v1 with a
# the chapters' drawings skipped while off screen (art), interleaved twice.
set -u
mkdir -p probe-out
grep -m1 'model name' /proc/cpuinfo | tee probe-out/cpu.txt
build() {
  pnpm site:build > "probe-out/build-$1.log" 2>&1 || { tail -50 "probe-out/build-$1.log"; exit 1; }
  rm -rf "dist-$1" && cp -r site/dist "dist-$1"
}
build v1
git apply -R site/e2e/perf-v1.patch || exit 1
build base
git apply site/e2e/perf-v1.patch || exit 1
PID=
serve() {
  [ -n "$PID" ] && kill "$PID" 2>/dev/null; sleep 1
  rm -rf site/dist && cp -r "dist-$1" site/dist
  node_modules/.bin/vite preview --config site/vite.config.ts --host 127.0.0.1 --port 4179 --strictPort > "probe-out/preview-$1.log" 2>&1 &
  PID=$!
  node -e 'const go = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch("http://127.0.0.1:4179/")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } process.exit(1); }; go();'
}
pass() {
  local name=$1 grep=$2; shift 2
  local start=$SECONDS
  env CI= "$@" pnpm exec playwright test --config playwright.latency.config.ts --grep "$grep" --reporter=list > "probe-out/$name.log" 2>&1
  echo "$name exit $? in $((SECONDS - start)) s"
}
pair='(museum|organ) answers within'
art='.site-porthole, figure:has(> svg.site-blueprint), figure:has(> svg.site-chart), figure:has(> svg.site-organ) { content-visibility: auto; contain-intrinsic-size: auto 600px; }'
for round in 1 2; do
  serve base; pass "base-$round" "$pair"
  serve v1; pass "v1-$round" "$pair"
  pass "art-$round" "$pair" PROBE_CSS="$art"
done
exit 0
