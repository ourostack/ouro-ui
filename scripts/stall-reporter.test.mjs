import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { StallReporter, stallReport } from "./stall-reporter.mts";

const options = { warnAfter: 120_000, failAfter: 300_000 };
const now = 1_000_000_000;

test("stallReport says ok, with no text, while tests keep finishing", () => {
  const report = stallReport([{ project: "ouro-chromium (chromium)", file: "a.test.tsx", name: "A > b", startedAt: now - 60_000 }], now - 5_000, now, options);
  assert.deepEqual(report, { level: "ok", text: "" });
});

test("stallReport says ok just under the warning threshold", () => {
  assert.equal(stallReport([], now - 119_999, now, options).level, "ok");
});

test("stallReport names each test in flight, with its project, file, name and running time", () => {
  const inFlight = [
    { project: "ouro-chromium (chromium)", file: "registry/ouro/components/ouro/dialog/dialog.test.tsx", name: "Dialog > closes on Escape", startedAt: now - 130_000 },
    { project: "ouro-webkit (webkit)", file: "test/stories.test.tsx", name: "stories > Button > default", startedAt: now - 45_000 },
  ];
  const report = stallReport(inFlight, now - 125_000, now, options);
  assert.equal(report.level, "warn");
  assert.equal(
    report.text,
    "[ouro-ui] Vitest has had no test finish for 2 min. In flight: ouro-chromium (chromium) registry/ouro/components/ouro/dialog/dialog.test.tsx > Dialog > closes on Escape (running 2m 10s); ouro-webkit (webkit) test/stories.test.tsx > stories > Button > default (running 45s).",
  );
});

test("stallReport says a file with no test running is in its setup, hooks or teardown", () => {
  const inFlight = [{ project: "ouro-touch (chromium)", file: "test/x.test.tsx", name: null, startedAt: now - 130_000 }];
  assert.match(stallReport(inFlight, now - 125_000, now, options).text, /In flight: ouro-touch \(chromium\) test\/x\.test\.tsx > \(no test running: its setup, hooks or teardown\) \(running 2m 10s\)\.$/);
});

test("stallReport says the run is between files or in teardown when nothing is in flight", () => {
  assert.equal(stallReport([], now - 125_000, now, options).text, "[ouro-ui] Vitest has had no test finish for 2 min. No test in flight: the run is between files or in teardown.");
});

test("stallReport stalls at the failure threshold, heading the list it names", () => {
  const inFlight = [{ project: "ouro-chromium (chromium)", file: "test/a.test.tsx", name: "A > hangs", startedAt: now - 300_000 }];
  const report = stallReport(inFlight, now - 300_000, now, options);
  assert.equal(report.level, "fail");
  assert.equal(
    report.text,
    "[ouro-ui] Vitest stalled for 5 min; failing the run so the shard names what hung. In flight: ouro-chromium (chromium) test/a.test.tsx > A > hangs (running 5m 0s).",
  );
});

test("stallReport takes both thresholds in milliseconds, shown in seconds when they are not whole minutes", () => {
  const short = { warnAfter: 10_000, failAfter: 20_000 };
  assert.equal(stallReport([], now - 10_000, now, short).text, "[ouro-ui] Vitest has had no test finish for 10 s. No test in flight: the run is between files or in teardown.");
  assert.match(stallReport([], now - 20_000, now, short).text, /^\[ouro-ui\] Vitest stalled for 20 s; /);
});

test("stallReport names a file still loading, one loaded and waiting to start, and one in a module hook", () => {
  const inFlight = [
    { project: "ouro-webkit (webkit)", file: "test/b.test.tsx", name: null, startedAt: now - 300_000, phase: "collecting" },
    { project: "ouro-webkit (webkit)", file: "test/c.test.tsx", name: null, startedAt: now - 20_000, phase: "waiting" },
    { project: "ouro-webkit (webkit)", file: "test/d.test.tsx", name: null, startedAt: now - 90_000, phase: "running", hook: "afterAll of \"Dialog\"" },
    { project: "ouro-webkit (webkit)", file: "test/e.test.tsx", name: null, startedAt: now - 30_000, phase: "running", hook: "beforeAll" },
  ];
  assert.equal(
    stallReport(inFlight, now - 300_000, now, options).text,
    '[ouro-ui] Vitest stalled for 5 min; failing the run so the shard names what hung. In flight: ouro-webkit (webkit) test/b.test.tsx (loading its module for 5m 0s); ouro-webkit (webkit) test/c.test.tsx (loaded, not started for 20s); ouro-webkit (webkit) test/d.test.tsx (in afterAll of "Dialog": its teardown, for 1m 30s); ouro-webkit (webkit) test/e.test.tsx (in beforeAll: its setup, for 30s).',
  );
});

test("stallReport names the files no worker has started, and how many files have finished", () => {
  const pending = { notStarted: [{ project: "ouro-chromium (chromium)", file: "test/x.test.tsx" }, { project: "ouro-webkit (webkit)", file: "test/x.test.tsx" }], finished: 40, total: 43 };
  const inFlight = [{ project: "ouro-chromium (chromium)", file: "test/a.test.tsx", name: "A > hangs", startedAt: now - 300_000 }];
  assert.equal(
    stallReport(inFlight, now - 300_000, now, options, pending).text,
    "[ouro-ui] Vitest stalled for 5 min; failing the run so the shard names what hung. In flight: ouro-chromium (chromium) test/a.test.tsx > A > hangs (running 5m 0s). Not started: ouro-chromium (chromium) test/x.test.tsx; ouro-webkit (webkit) test/x.test.tsx. Finished 40 of 43 files.",
  );
});

test("stallReport lists at most twelve files not started, and says how many more there are", () => {
  const notStarted = Array.from({ length: 14 }, (_, index) => ({ project: "ouro-chromium (chromium)", file: `test/f${index}.test.tsx` }));
  const text = stallReport([], now - 125_000, now, options, { notStarted, finished: 0, total: 14 }).text;
  assert.match(text, /Not started: ouro-chromium \(chromium\) test\/f0\.test\.tsx; .* ouro-chromium \(chromium\) test\/f11\.test\.tsx; and 2 more\. Finished 0 of 14 files\.$/);
  assert.doesNotMatch(text, /f12\.test\.tsx/);
});

test("stallReport names a file with no project without a stray space", () => {
  const inFlight = [{ project: "", file: "test/b.test.tsx", name: null, startedAt: now - 130_000, phase: "collecting" }];
  assert.equal(
    stallReport(inFlight, now - 125_000, now, options).text,
    "[ouro-ui] Vitest has had no test finish for 2 min. In flight: test/b.test.tsx (loading its module for 2m 10s).",
  );
});

/** The stall text the reporter writes once a fake run has stalled, from the events `feed` sends it. */
async function stallTextFor(feed) {
  const writes = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  const reporter = new StallReporter({ warnAfter: 1, failAfter: 1e9, intervalMs: 5 });
  try {
    reporter.onInit({ config: { root: "/repo" } });
    feed(reporter);
    await sleep(40);
  } finally {
    reporter.onTestRunEnd();
    process.stderr.write = write;
  }
  return writes.join("");
}

const project = { name: "ouro-chromium (chromium)" };
const moduleOf = (file) => ({ type: "module", project, moduleId: `/repo/${file}` });
const specOf = (file) => ({ project, moduleId: `/repo/${file}` });

test("StallReporter names a file that is still loading, and the files no worker has started", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx"), specOf("b.test.tsx"), specOf("c.test.tsx")]);
    reporter.onTestModuleQueued(moduleOf("a.test.tsx"));
  });
  assert.match(text, /^\[ouro-ui\] Vitest has had no test finish for .*In flight: ouro-chromium \(chromium\) a\.test\.tsx \(loading its module for \d+s\)\. Not started: ouro-chromium \(chromium\) b\.test\.tsx; ouro-chromium \(chromium\) c\.test\.tsx\. Finished 0 of 3 files\.\n$/);
});

test("StallReporter follows a file through its phases, its suite's hook, its module's teardown, and finishes it", async () => {
  const suite = { type: "suite", name: "Dialog", module: moduleOf("a.test.tsx") };
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx"), specOf("b.test.tsx")]);
    reporter.onTestModuleQueued(moduleOf("a.test.tsx"));
    reporter.onTestModuleCollected(moduleOf("a.test.tsx"));
    reporter.onTestModuleStart(moduleOf("a.test.tsx"));
    reporter.onHookStart({ name: "beforeAll", entity: suite });
    reporter.onHookEnd({ name: "beforeAll", entity: suite });
    reporter.onHookStart({ name: "afterAll", entity: moduleOf("a.test.tsx") });
    reporter.onTestModuleEnd(moduleOf("a.test.tsx"));
    reporter.onTestModuleQueued(moduleOf("b.test.tsx"));
  });
  assert.match(text, /In flight: ouro-chromium \(chromium\) b\.test\.tsx \(loading its module for \d+s\)\. Finished 1 of 2 files\.\n$/);
});

test("StallReporter names a module's afterAll as its teardown while its tests have finished", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    reporter.onTestModuleQueued(moduleOf("a.test.tsx"));
    reporter.onTestModuleCollected(moduleOf("a.test.tsx"));
    reporter.onTestModuleStart(moduleOf("a.test.tsx"));
    reporter.onHookStart({ name: "afterAll", entity: moduleOf("a.test.tsx") });
  });
  assert.match(text, /In flight: ouro-chromium \(chromium\) a\.test\.tsx \(in afterAll: its teardown, for \d+s\)\. Finished 0 of 1 files\.\n$/);
});

test("StallReporter says the run is in teardown when every file has started and none is in flight", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    reporter.onTestModuleQueued(moduleOf("a.test.tsx"));
    reporter.onTestModuleStart(moduleOf("a.test.tsx"));
    reporter.onTestModuleEnd(moduleOf("a.test.tsx"));
  });
  assert.match(text, /^\[ouro-ui\] Vitest has had no test finish for .*No test in flight: the run is between files or in teardown\. Finished 1 of 1 files\.\n$/);
});
