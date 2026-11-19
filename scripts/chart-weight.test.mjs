import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every chunk of an app's Vite production build of `probe`, with React left out as the app's own: its file, whether
 * the page loads it at once (the entry) or later (a dynamic import), its gzip size, and how many recharts modules it holds.
 */
async function chunks(probe) {
  const result = await build({
    root,
    configFile: false,
    logLevel: "silent",
    mode: "production",
    resolve: { alias: { "@": root } },
    build: { write: false, rollupOptions: { input: join(root, "scripts/fixtures", probe), external: [/^react($|\/)/, /^react-dom($|\/)/] } },
  });
  return (Array.isArray(result) ? result[0] : result).output
    .filter((output) => output.type === "chunk")
    .map((chunk) => ({
      file: chunk.fileName,
      entry: chunk.isEntry,
      gzip: gzipSync(chunk.code).byteLength,
      recharts: Object.keys(chunk.modules).filter((id) => id.includes("/node_modules/recharts/")).length,
    }));
}

// Measured at 14,737 bytes when Chart began drawing its own marks (Vite 8, React external); before, the same probe
// loaded 13,386 bytes with the page and Recharts' chunk of 112,590 bytes after it, 125,976 in all. The range keeps "about
// 15 KB" true: the ceiling fails a change that brings a charting library back, and the floor one that makes the
// docs' figure stale by shrinking it.
const [FLOOR, CEILING] = [13_000, 16_000];

test("a chart drawn with type adds about 15 KB gzip to an app's build, with no recharts in any chunk", async () => {
  const built = await chunks("chart-weight-probe.ts");
  assert.deepEqual(
    built.map((chunk) => chunk.recharts),
    built.map(() => 0),
    "no chunk holds a recharts module",
  );
  assert.equal(built.length, 1, `one chunk, and no lazy one: ${built.map((chunk) => chunk.file).join(", ")}`);
  const total = built.reduce((sum, chunk) => sum + chunk.gzip, 0);
  assert.ok(total <= CEILING, `${total} bytes gzip, over the ${CEILING} ceiling`);
  assert.ok(total >= FLOOR, `${total} bytes gzip, under the ${FLOOR} floor: update "about 15 KB" in chart.tsx and the range`);
});

test("ChartTooltip and ChartLegend load recharts in a chunk of its own, after the page (control)", async () => {
  const built = await chunks("chart-weight-parts-probe.ts");
  const entry = built.find((chunk) => chunk.entry);
  const lazy = built.filter((chunk) => !chunk.entry);
  assert.equal(entry.recharts, 0, "the page's own chunk holds no recharts");
  assert.ok(
    lazy.some((chunk) => chunk.recharts > 0),
    "a lazy chunk holds recharts",
  );
});
