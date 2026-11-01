#!/usr/bin/env bash
# PROBE (never merge): museum's and organ's presses traced, then the whole latency suite, untraced.
set -u
mkdir -p probe-out
grep -m1 'model name' /proc/cpuinfo | tee probe-out/cpu.txt
PROBE_SOURCEMAP=1 pnpm site:build > probe-out/build.log 2>&1 || { tail -50 probe-out/build.log; exit 1; }
mkdir -p probe-out/maps && cp site/dist/assets/*.map probe-out/maps/ 2>/dev/null
node_modules/.bin/vite preview --config site/vite.config.ts --host 127.0.0.1 --port 4179 --strictPort > probe-out/preview.log 2>&1 &
node -e 'const go = async () => { for (let i = 0; i < 120; i++) { try { if ((await fetch("http://127.0.0.1:4179/")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } process.exit(1); }; go();'
env CI= PROBE_OUT=probe-out pnpm exec playwright test --config playwright.latency.config.ts site/e2e/press-trace.latency.spec.ts --reporter=list > probe-out/trace.log 2>&1; echo "trace exit $?"
env CI= pnpm exec playwright test --config playwright.latency.config.ts --grep-invert traced --reporter=list > probe-out/latency.log 2>&1; echo "latency exit $?"
grep -E "passed|failed" probe-out/latency.log
exit 0
