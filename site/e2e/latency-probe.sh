#!/usr/bin/env bash
# PROBE (never merge): two-part judging of every latency check at 4x and at 6x (a runner 1.5 times
# slower), X-ray with the Inspector 100 ms after the press (#350) at 4x and 6x, and Bell with 600 and
# 1,200 rounds of extra work at 4x and 6x.
set -u
grep -m1 'model name' /proc/cpuinfo | tee probe-out-cpu.txt
mkdir -p probe-out
mv probe-out-cpu.txt probe-out/cpu.txt
serve() {
  node_modules/.bin/vite preview --config site/vite.config.ts --host 127.0.0.1 --port 4179 --strictPort > probe-out/preview.log 2>&1 &
  echo $! > probe-out/preview.pid
  node -e 'const go = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch("http://127.0.0.1:4179/")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } process.exit(1); }; go();'
}
pass() {
  local name=$1 grep=$2; shift 2
  local start=$SECONDS
  env CI= "$@" pnpm exec playwright test --config playwright.latency.config.ts --grep "$grep" --reporter=list > "probe-out/$name.log" 2>&1
  echo "$name exit $? in $((SECONDS - start)) s"
}
build() {
  kill "$(cat probe-out/preview.pid 2>/dev/null)" 2>/dev/null; sleep 1
  env "$@" pnpm site:build > "probe-out/build-$#.log" 2>&1 || { tail -50 "probe-out/build-$#.log"; exit 1; }
  serve
}
build PROBE_BUILD=main
pass rel4 'answers within'
pass rel6 'answers within' LATENCY_THROTTLE=6
build VITE_XRAY_PROBE_DELAY=1
pass xray-delay4 'xray answers within'
pass xray-delay6 'xray answers within' LATENCY_THROTTLE=6
build VITE_LATENCY_PROBE_SLOW=600
pass slow600-4 'bell answers within'
pass slow600-6 'bell answers within' LATENCY_THROTTLE=6
build VITE_LATENCY_PROBE_SLOW=1200
pass slow1200-4 'bell answers within'
pass slow1200-6 'bell answers within' LATENCY_THROTTLE=6
exit 0
