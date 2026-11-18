import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { StallReporter, browserPageSources, holdText, pageStateText, readPageStates, slowTestText, stallReport } from "./stall-reporter.mts";

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

test("slowTestText names a test that has run for half its timeout, with the longest hold on Node's event loop", () => {
  const entry = { project: "ouro-chromium (chromium)", file: "registry/ouro/components/ouro/composer/composer.test.tsx", name: "Composer > grows" };
  assert.equal(
    slowTestText(entry, 7_600, 15_000, 9_100),
    "[ouro-ui] Vitest: ouro-chromium (chromium) registry/ouro/components/ouro/composer/composer.test.tsx > Composer > grows has run for 7s of its 15 s timeout. Node's event loop was held up for 9s while it ran, so an answer from Node may have waited behind it. The reporter cannot see the browser command a test awaits; a timeout names it.",
  );
});

test("slowTestText says Node was not held up when no hold reached 50 ms, and shows short spans in milliseconds", () => {
  assert.equal(
    slowTestText({ project: "", file: "test/a.test.tsx", name: "A > b" }, 480, 1_000, 0),
    "[ouro-ui] Vitest: test/a.test.tsx > A > b has run for 480 ms of its 1 s timeout. Node's event loop was not held up for 50 ms or more while it ran, so the wait is not in Node. The reporter cannot see the browser command a test awaits; a timeout names it.",
  );
});

/** Holds Node's event loop for `ms`, as work in the same process does, so no timer or answer runs meanwhile. */
function holdNode(ms) {
  const end = Date.now() + ms;
  let spins = 0;
  while (Date.now() < end) spins++;
  return spins;
}

/** A test case as Vitest hands it to the reporter: its id, full name, timeout (or the project's), and file. */
const caseOf = (file, name, timeout, projectTimeout = 15_000) => ({
  id: `${file} ${name}`,
  fullName: name,
  module: { moduleId: `/repo/${file}`, project: { name: "ouro-chromium (chromium)", config: { testTimeout: projectTimeout } } },
  options: { timeout },
});

test("StallReporter names a test that has run for half its timeout once, and the hold on Node's event loop while it ran", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    reporter.onTestCaseReady(caseOf("a.test.tsx", "A > slow", 100));
    holdNode(120);
  });
  const named = text.split("\n").filter((line) => line.includes("has run for"));
  assert.equal(named.length, 1);
  assert.match(named[0], /^\[ouro-ui\] Vitest: ouro-chromium \(chromium\) a\.test\.tsx > A > slow has run for \d+ ms of its 100 ms timeout\. Node's event loop was held up for \d+ ms while it ran/);
});

test("StallReporter takes a test's timeout from its project when the test sets none", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    reporter.onTestCaseReady(caseOf("a.test.tsx", "A > default", undefined, 100));
    holdNode(80);
  });
  assert.match(text, /has run for \d+ ms of its 100 ms timeout/);
});

test("StallReporter does not name a test that finishes before half its timeout", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    const testCase = caseOf("a.test.tsx", "A > quick", 60_000);
    reporter.onTestCaseReady(testCase);
    reporter.onTestCaseResult(testCase);
  });
  assert.doesNotMatch(text, /has run for/);
});

test("holdText names a hold and each test in flight with its running time, or says none is", () => {
  const inFlight = [{ project: "ouro-chromium (chromium)", file: "registry/ouro/components/ouro/composer/composer.test.tsx", name: "Composer > grows", startedAt: now - 20_000 }];
  assert.equal(
    holdText(20_100, inFlight, now),
    "[ouro-ui] Vitest: Node's event loop was held up for 20s, and a browser command answered in that time waited behind it. In flight: ouro-chromium (chromium) registry/ouro/components/ouro/composer/composer.test.tsx > Composer > grows (running 20s).",
  );
  assert.equal(
    holdText(1_200, [], now),
    "[ouro-ui] Vitest: Node's event loop was held up for 1s, and a browser command answered in that time waited behind it. No test in flight.",
  );
});

test("StallReporter names a hold of a second or more as it ends, with the test in flight", async () => {
  const text = await stallTextFor((reporter) => {
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    reporter.onTestCaseReady(caseOf("a.test.tsx", "A > held", 60_000));
    holdNode(1100);
  });
  assert.match(
    text,
    /\[ouro-ui\] Vitest: Node's event loop was held up for 1s, and a browser command answered in that time waited behind it\. In flight: ouro-chromium \(chromium\) a\.test\.tsx > A > held \(running 1s\)\./,
  );
});

const healthy = { fonts: "loaded", loading: [], visible: true, focused: true, frames: true };
const pageLine = (state) => pageStateText({ kind: "read", label: "ouro-chromium (chromium)", path: "/dialog", ...state });

test("pageStateText says a healthy page has its fonts loaded, is visible and focused, and its frames arrive", () => {
  assert.equal(pageLine(healthy), "[ouro-ui] Vitest page ouro-chromium (chromium): fonts loaded, visible, focused, frames arrive, /dialog");
});

test("pageStateText names the families of the fonts still loading", () => {
  assert.equal(
    pageLine({ ...healthy, fonts: "loading", loading: ["Geist", "Geist Mono"] }),
    "[ouro-ui] Vitest page ouro-chromium (chromium): fonts loading (Geist, Geist Mono), visible, focused, frames arrive, /dialog",
  );
});

test("pageStateText says a hidden page is hidden and not focused", () => {
  assert.equal(pageLine({ ...healthy, visible: false, focused: false }), "[ouro-ui] Vitest page ouro-chromium (chromium): fonts loaded, hidden, not focused, frames arrive, /dialog");
});

test("pageStateText says a page where no frame arrives in a second has no frame", () => {
  assert.equal(pageLine({ ...healthy, frames: false }), "[ouro-ui] Vitest page ouro-chromium (chromium): fonts loaded, visible, focused, no frame in 1 s, /dialog");
});

test("pageStateText says a page that did not answer in 2 s, and gives its path", () => {
  assert.equal(
    pageStateText({ kind: "unanswered", label: "ouro-chromium (chromium)", path: "/dialog" }),
    "[ouro-ui] Vitest page ouro-chromium (chromium): did not answer in 2 s, /dialog",
  );
});

test("pageStateText says why a project has no page to read, or a page could not be read", () => {
  assert.equal(
    pageStateText({ kind: "note", label: "unit", note: "has no browser, so it has no page to read." }),
    "[ouro-ui] Vitest page unit: has no browser, so it has no page to read.",
  );
});

const fakePage = (path, reading) => ({ url: () => `http://localhost:63315${path}`, evaluate: async () => reading });

test("readPageStates reads a page's own state, with the path of its URL", async () => {
  assert.deepEqual(await readPageStates([{ label: "a", page: fakePage("/dialog?x=1", healthy) }]), [
    { kind: "read", label: "a", path: "/dialog", ...healthy },
  ]);
});

test("readPageStates says a page did not answer when it outlives its deadline", async () => {
  const page = { url: () => "http://localhost:63315/slow", evaluate: () => new Promise(() => {}) };
  assert.deepEqual(await readPageStates([{ label: "b", page }], 20), [{ kind: "unanswered", label: "b", path: "/slow" }]);
});

test("readPageStates says why a page could not be read when reading it fails", async () => {
  const page = { url: () => "http://localhost:63315/", evaluate: () => Promise.reject(new Error("Target closed")) };
  assert.deepEqual(await readPageStates([{ label: "c", page }]), [{ kind: "note", label: "c", note: "could not be read: Target closed" }]);
});

test("browserPageSources names a project with no browser, no pages or no page open, and reads each page of the rest", () => {
  const pageA = fakePage("/a", healthy);
  const pageB = fakePage("/b", healthy);
  const vitest = {
    projects: [
      { name: "ouro-chromium (chromium)", browser: { provider: { pages: new Map([["s1", pageA]]) } } },
      { name: "unit", browser: undefined },
      { name: "ouro-webkit (webkit)", browser: { provider: {} } },
      { name: "ouro-touch (chromium)", browser: { provider: { pages: new Map() } } },
      { name: "two", browser: { provider: { pages: new Map([["s1", pageA], ["s2", pageB]]) } } },
    ],
  };
  assert.deepEqual(
    browserPageSources(vitest).map((source) => ("page" in source ? [source.label, source.page] : [source.label, source.note])),
    [
      ["ouro-chromium (chromium)", pageA],
      ["unit", "has no browser, so it has no page to read."],
      ["ouro-webkit (webkit)", "its browser provider keeps no pages, so there is no page to read."],
      ["ouro-touch (chromium)", "has no page open yet, so there is no page to read."],
      ["two s1", pageA],
      ["two s2", pageB],
    ],
  );
  assert.deepEqual(browserPageSources(undefined), []);
});

/** Polls until `condition` holds, failing after five seconds. */
async function until(condition) {
  const end = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() > end) assert.fail("the reporter did not exit");
    await sleep(5);
  }
}

/** Runs a reporter through a stall with injected pages and exit, until it exits; returns what it wrote, its lookups and its exit codes. */
async function stallRun({ pages, warnAfter = 1, failAfter = 1e9, diagnosticMs = 1_000 }) {
  const writes = [];
  const exits = [];
  let lookups = 0;
  const write = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  const reporter = new StallReporter({
    warnAfter,
    failAfter,
    intervalMs: 5,
    pages: (vitest) => {
      lookups++;
      return pages(vitest);
    },
    exit: (code) => exits.push(code),
    diagnosticMs,
  });
  try {
    reporter.onInit({ config: { root: "/repo" } });
    reporter.onTestRunStart([specOf("a.test.tsx")]);
    await until(() => exits.length > 0);
  } finally {
    reporter.onTestRunEnd();
    process.stderr.write = write;
  }
  return { text: writes.join(""), lookups, exits };
}

test("StallReporter reads each page once at warn and once at fail, then exits 1 at fail", async () => {
  const { text, lookups, exits } = await stallRun({
    failAfter: 60,
    pages: () => [{ label: "ouro-chromium (chromium)", page: fakePage("/dialog", healthy) }],
  });
  assert.equal(lookups, 2);
  assert.deepEqual(exits, [1]);
  assert.equal(text.split("\n").filter((line) => line === "[ouro-ui] Vitest page ouro-chromium (chromium): fonts loaded, visible, focused, frames arrive, /dialog").length, 2);
});

test("StallReporter still exits 1 at fail when the page lookup hangs, and says the lookup did not finish", async () => {
  const { text, exits } = await stallRun({ failAfter: 30, diagnosticMs: 20, pages: () => new Promise(() => {}) });
  assert.deepEqual(exits, [1]);
  assert.match(text, /\[ouro-ui\] Vitest page state: the page lookup or a page read did not finish in 20 ms\./);
});

test("StallReporter still exits 1 at fail when the page lookup throws, and says why", async () => {
  const { text, exits } = await stallRun({
    failAfter: 30,
    pages: () => {
      throw new Error("no vitest");
    },
  });
  assert.deepEqual(exits, [1]);
  assert.match(text, /\[ouro-ui\] Vitest page lookup failed: no vitest\./);
});
