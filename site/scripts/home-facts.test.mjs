import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { currentHomeFacts, deriveBenchmark, deriveCounts, WAY_NAMES } from "./home-facts.mts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const page = readFileSync(join(root, "docs/guides/agent-interfaces.md"), "utf8");

test("the home page's benchmark is the benchmark page's summary table and errand, in the home page's order", () => {
  const { benchmark } = currentHomeFacts(root);
  assert.deepEqual(
    benchmark.rows.map((row) => row.way),
    ["actions", "bridge", "browser", "plain"],
  );
  for (const row of benchmark.rows) {
    const line = page.split("\n").find((entry) => entry.startsWith(`| ${WAY_NAMES[row.way]} |`));
    assert.ok(line.includes(`(${row.done}%)`) && line.includes(`| ${row.steps} ± `) && line.includes(`| ${row.tokens} ± `), line);
    assert.match(page, new RegExp(`^- ${WAY_NAMES[row.way].replace(/[()]/g, "\\$&")}: ${row.paid}\\.$`, "m"));
  }
  assert.match(page, new RegExp(`Across ${benchmark.trials} checked trials by ${benchmark.models} models`));
});

test("the build fails when the benchmark stops saying what the home page says about it", () => {
  const actionsRow = (line) => line.startsWith(`| ${WAY_NAMES.actions} |`);
  const edit = (change) => page.split("\n").map((line) => (actionsRow(line) ? change(line) : line)).join("\n");
  assert.throws(() => deriveBenchmark(edit((line) => line.replace("(98%)", "(90%)"))), /within a point of the best/);
  assert.throws(() => deriveBenchmark(edit((line) => line.replace("| 2.0 ± ", "| 9.0 ± "))), /the fewest steps/);
  assert.throws(() => deriveBenchmark(edit((line) => line.replace("| 2,990 ± ", "| 3,990 ± "))), /the fewest tokens/);
  assert.throws(() => deriveBenchmark(page.replace(`- ${WAY_NAMES.actions}: 0 of 32.`, `- ${WAY_NAMES.actions}: 1 of 32.`)), /said no/);
  assert.throws(() => deriveBenchmark(page.replace("## All models together", "## Everything")), /no row for/);
});

test("components per platform come from the registry, the Apple kit and the platform pages' own sentence", () => {
  const files = { registry: JSON.stringify({ items: [{ type: "registry:ui" }, { type: "registry:lib" }, { type: "registry:ui" }] }), appleKit: JSON.stringify({ components: [1, 2, 3] }), windows: "The kit has twenty-six of core's components as WinUI 3 controls.", android: "The kit has twenty-seven of core's components as composables." };
  assert.deepEqual(deriveCounts(files), { web: 2, apple: 3, windows: 26, android: 27 });
  assert.throws(() => deriveCounts({ ...files, android: "Twenty-six components." }), /docs\/platforms\/android\.md/);
});
