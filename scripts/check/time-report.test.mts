import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import type { BrowserType } from "playwright";
import { BUDGETS, merge, summary, type Report } from "../../registry/ouro/check/check.ts";
import type { TimeObservation } from "../../registry/ouro/check/time-check.ts";
import { scratchDir } from "../scratch.mjs";

const observation = (status: TimeObservation["reading"]["status"], run = 1): TimeObservation => ({
  site: "test", page: "/", width: 390, height: 844, theme: "light", dpr: 2, viewport: { width: 390, height: 844 },
  ref: "", element: "the page", phase: "loading", run, reading: status === "measured" ? {
    status, expected: { document: 1000, url: "https://test/", since: 0 }, observed: { document: 1000, url: "https://test/" }, until: 10, tasks: [],
  } : { status, reason: "test" },
});
const report = (): Report => ({
  targets: [], sizes: [[390, 844]], themes: ["light"], pages: [], findings: [], fixed: [], candidates: [], allowances: [], shots: [],
});

test("the summary distinguishes missing measurement from measured and intentionally unperformed windows", () => {
  const data = report();
  data.time = ["measured", "unsupported", "incomplete", "not-run"].map((status) => observation(status as TimeObservation["reading"]["status"]));
  assert.match(summary(data), /Task windows: 1 measured, 1 incomplete, 1 unsupported, 1 not run/);
  assert.equal(BUDGETS["long-task"], 100);
  assert.doesNotMatch(summary(report()), /Task windows:/, "older reports stay readable");
});

test("shard merge retains every raw observation deterministically and gates nonnumeric measurement failures", async () => {
  const root = scratchDir("ouro-time-report-");
  // No pages, shots, or candidates: compose needs no browser operations. Only the unused output adapter is substituted.
  const chromium = { launch: async () => ({
    newContext: async () => ({ newPage: async () => ({}), close: async () => undefined }),
    close: async () => undefined,
  }) } as unknown as BrowserType;
  const dirs = [join(root, "first"), join(root, "second")];
  for (const [i, dir] of dirs.entries()) {
    await mkdir(dir);
    const data = report();
    if (!i) {
      data.time = [observation("unsupported", 2), observation("incomplete", 1)];
      data.findings.push({ site: "test", page: "/", width: 390, height: 844, theme: "light", rule: "long-task", element: "loading the page (incomplete)", detail: "navigated", gated: true });
    }
    await writeFile(join(dir, "report.json"), JSON.stringify(data));
  }
  const result = await merge({ dirs, out: join(root, "merged"), chromium });
  assert.deepEqual(result.time?.map((row) => row.run), [1, 2]);
  assert.equal(result.gated.length, 1);
  assert.equal(result.gated[0]?.value, undefined);
  const persisted = JSON.parse(await readFile(join(root, "merged", "report.json"), "utf8")) as Report;
  assert.deepEqual(persisted.time, result.time);
  const waived = await merge({ dirs, out: join(root, "waived"), chromium, config: { waive: { "**": { "long-task": "source review" } } } });
  assert.equal(waived.gated.length, 0);
  assert.equal(waived.findings.length, 1);
});
