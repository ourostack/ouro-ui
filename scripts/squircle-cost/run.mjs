import { execFile, execFileSync } from "node:child_process";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build } from "vite";
import { compareRounds } from "./compare.mjs";

// The squircle cost probe: where the engine has no corner-shape (Safari and WKWebView 26), Ouro draws each squircle
// through clip paths, which WebKit redraws whenever a repaint touches them. It measures that cost in a real WKWebView
// (harness.swift), on macOS only: the frame time while the area around 270 squircle controls repaints, against the
// same page drawn as before #1385 (five points a corner, five-point.css) and with the surfaces hidden, and each key's
// time to paint while typing beside squircle controls. Fails when the repaint costs more than the five-point drawing,
// judged round by round (compare.mjs), so one slow stretch of the runner cannot decide it.
// What a squircle control costs a scrolling list (a layer of its own each, which WKWebView composites every frame) is
// held by squircle-surface.test.tsx, which allows no such layer: a wheel count here did not show it.
// Usage: node scripts/squircle-cost/run.mjs [rounds]   (writes .tmp/squircle-cost/report.json)
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const rounds = Number(process.argv[2] ?? 10);
const work = join(tmpdir(), `ouro-squircle-cost-${process.pid}`);

await build({
  configFile: false,
  root: here,
  base: "./",
  logLevel: "warn",
  resolve: { alias: { "@": repo } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), tailwindcss()],
  build: { outDir: join(work, "page"), emptyOutDir: true },
});
execFileSync(
  "swiftc",
  ["-O", join(here, "harness.swift"), "-o", join(work, "harness")],
  { stdio: "inherit" },
);

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};
const server = createServer((request, response) => {
  const path = join(
    work,
    "page",
    new URL(request.url, "http://x").pathname.replace(/\/$/, "/index.html"),
  );
  try {
    const body = readFileSync(path);
    response
      .writeHead(200, {
        "content-type": types[extname(path)] ?? "application/octet-stream",
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
let raw;
try {
  // Run without blocking: this process serves the page the harness opens.
  const out = await new Promise((done, fail) =>
    execFile(
      join(work, "harness"),
      [`http://127.0.0.1:${server.address().port}/index.html`, String(rounds)],
      { maxBuffer: 1 << 26, timeout: 20 * 60_000 },
      (error, stdout) => (error && !stdout ? fail(error) : done(stdout)),
    ),
  );
  raw = JSON.parse(out);
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
if (raw.error) throw new Error(raw.error);

const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;
const quantile = (values, q) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor(values.length * q))
  ];
const round = (value) => Math.round(value * 100) / 100;
const typing = (keys) => ({
  keys: keys.length,
  p50: round(quantile(keys, 0.5)),
  p95: round(quantile(keys, 0.95)),
  max: round(Math.max(...keys)),
});
const compared = compareRounds(raw.bench.on, raw.bench.ref, rounds);
const on = mean(raw.bench.on);
const off = mean(raw.bench.off);
const ref = mean(raw.bench.ref);
const report = {
  engine: raw.engine,
  rounds,
  repaint: {
    frames: raw.bench.on.length,
    meanMs: round(on),
    fivePointMeanMs: round(ref),
    withoutSurfacesMeanMs: round(off),
    rounds: compared.pairs.map((pair) => ({ medianMs: round(pair.on), fivePointMedianMs: round(pair.ref) })),
    slowerRounds: compared.slower,
    fasterRounds: compared.faster,
    slowerRoundsNeeded: compared.needed,
  },
  typing: {
    "120wpm": typing(raw.typing.fast),
    "90ms": typing(raw.typing.slow),
  },
};
mkdirSync(".tmp/squircle-cost", { recursive: true });
writeFileSync(
  ".tmp/squircle-cost/report.json",
  `${JSON.stringify({ ...report, samples: raw }, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
const summary = [
  `Squircle cost in ${raw.engine.userAgent}, corner-shape ${raw.engine.cornerShape ? "native" : "missing (the fallback runs)"}, ${rounds} rounds:`,
  `- Repainting around ${raw.engine.surfaces} squircle surfaces: ${round(on)} ms a frame; drawn as before #1385, ${round(ref)} ms; without them, ${round(off)} ms.`,
  `- By round, the median frame was slower than the five-point drawing's in ${compared.slower} rounds and faster in ${compared.faster}; ${compared.needed} slower rounds would fail.`,
  `- Typing at 120 wpm beside them, key to paint: p50 ${report.typing["120wpm"].p50} ms, p95 ${report.typing["120wpm"].p95} ms.`,
  `- Typing a key every 90 ms: p50 ${report.typing["90ms"].p50} ms, p95 ${report.typing["90ms"].p95} ms.`,
].join("\n");
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
if (raw.engine.cornerShape) {
  console.error(
    "This engine draws corner-shape natively, so the fallback was not measured: run on macOS 26.",
  );
  process.exit(1);
}
const problems = [
  compared.costsMore &&
    `Repainting around squircle controls costs more than the five-point drawing before #1385: its median frame was slower in ${compared.slower} of ${rounds} rounds (${compared.needed} fail), ${round(on)} ms a frame on average against ${round(ref)} ms.`,
].filter(Boolean);
for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
