import assert from "node:assert/strict";
import { test } from "node:test";
import { createContext, runInContext } from "node:vm";
import { armTime, continueTime, listenForTime, readTime, timeFailure, timeIssues, compareTimeObservations, type TimeObservation, type TimeReading, type TimeWindow } from "../../registry/ouro/check/time-check.ts";

// Removing draining, resetting on arm, rounding durations, or accepting a replacement document must break these tests.
// The VM exercises the serialized functions, with only the browser's entry delivery and clock substituted.
const probe = (supported: string[] | null = ["longtask"]) => {
  const pending: object[] = [];
  let deliver: (entries: object[]) => void = () => undefined;
  const context = createContext({
    performance: { now: () => 10, timeOrigin: 1000 },
    location: { href: "https://example.test/" },
    PerformanceObserver: supported === null ? undefined : class {
      static supportedEntryTypes = supported;
      constructor(callback: (list: { getEntries: () => object[] }) => void) {
        deliver = (entries) => callback({ getEntries: () => entries });
      }
      observe() {}
      takeRecords() { return pending.splice(0); }
    },
  });
  runInContext("window = globalThis", context);
  const call = <A, R>(fn: (arg: A) => R, arg: A) =>
    JSON.parse(JSON.stringify(runInContext(`(${fn.toString()})(${JSON.stringify(arg)})`, context))) as R;
  const init = () => runInContext(`(${listenForTime.toString()})()`, context);
  const arm = () => call(armTime, undefined);
  const read = (window: TimeWindow) => call(readTime, window);
  const clock = (now: number) => { context.performance.now = () => now; };
  const entry = (startTime: number, duration: number, entryType = "longtask") => ({ startTime, duration, entryType });
  return { context, pending, deliver: (entries: object[]) => deliver(entries), init, arm, read, clock, entry };
};

test("drains delayed delivery and uses raw half-open task-start boundaries without resetting history", () => {
  const p = probe();
  p.init();
  const window = p.arm();
  p.pending.push(p.entry(9, 500), p.entry(10, 99.999), p.entry(12, 100), p.entry(15, 100.001), p.entry(20, 800), p.entry(13, 900, "paint"));
  p.clock(20);
  const reading = p.read(window);
  assert.equal(reading.status, "measured");
  assert.deepEqual(reading.tasks, [{ startTime: 10, duration: 99.999 }, { startTime: 12, duration: 100 }, { startTime: 15, duration: 100.001 }]);
  assert.deepEqual(p.read(window), reading, "read is nondestructive");
  const next = p.arm();
  p.clock(30);
  assert.deepEqual(p.read(next).tasks, [{ startTime: 20, duration: 800 }]);
});

test("callback entries and queued entries survive repeated arming and init is idempotent", () => {
  const p = probe();
  p.init();
  const window = p.arm();
  p.deliver([p.entry(11, 120)]);
  p.init();
  p.clock(15);
  p.arm();
  p.pending.push(p.entry(16, 130));
  p.clock(20);
  assert.deepEqual(p.read(window).tasks, [{ startTime: 11, duration: 120 }, { startTime: 16, duration: 130 }]);
});

test("a measured empty window is distinct from unsupported or missing instrumentation", () => {
  const p = probe();
  assert.equal(p.read(p.arm()).reason, "missing-instrumentation");
  p.init();
  p.clock(20);
  assert.deepEqual(p.read(p.arm()).tasks, []);
  for (const support of [[], null]) {
    const unsupported = probe(support);
    unsupported.init();
    const reading = unsupported.read(unsupported.arm());
    assert.equal(reading.status, "unsupported");
    assert.equal(reading.tasks, undefined);
  }
});

test("same-document URL changes remain measured but replaced documents cannot donate tasks", () => {
  const p = probe();
  p.init();
  const window = p.arm();
  p.context.location.href += "#next";
  p.clock(20);
  assert.equal(p.read(window).status, "measured");
  assert.equal(p.read(window).observed?.url, "https://example.test/#next");
  p.context.performance.timeOrigin = 2000;
  const navigated = p.read(window);
  assert.equal(navigated.status, "incomplete");
  assert.equal(navigated.reason, "navigated");
  assert.equal(navigated.tasks, undefined);
  p.context.location.href = window.url;
  assert.equal(p.read(window).reason, "document-changed");
});

test("only recognized context-destruction failures become incomplete readings", () => {
  const window = { document: 1000, url: "https://example.test/", since: 10 };
  const reading = timeFailure(new Error("page.evaluate: Execution context was destroyed, most likely because of a navigation"), window, "https://example.test/next");
  assert.equal(reading.status, "incomplete");
  assert.deepEqual(reading.expected, window);
  assert.equal(reading.until, undefined);
  assert.equal(reading.tasks, undefined);
  assert.deepEqual(reading.observed, { url: "https://example.test/next" });
  assert.throws(() => timeFailure(new Error("application bug"), window, window.url), /application bug/);
});

const observation = (reading: TimeReading, run = 1, phase = "press-open"): TimeObservation => ({
  site: "example.test", page: "/", width: 390, height: 844, theme: "light", dpr: 2, viewport: { width: 390, height: 844 },
  ref: "control-1", element: "Save", phase, run, reading,
});
const measured = (duration: number): TimeReading => ({
  status: "measured", expected: { document: 1000, url: "https://example.test/", since: 10 },
  observed: { document: 1000, url: "https://example.test/" }, until: 20, tasks: [{ startTime: 11, duration }],
});

test("closing windows cannot rebind the opening target to a replacement document", () => {
  const opening = measured(120);
  const same = { document: 1000, url: "https://example.test/#next", since: 30 };
  assert.deepEqual(continueTime(opening, same), same, "same-document URL changes retain the closing measurement");
  assert.deepEqual(continueTime({ status: "unsupported", expected: opening.expected, reason: "longtask-unavailable" }, same), same);
  const replacement = { ...same, document: 2000 };
  const stopped = continueTime(opening, replacement);
  assert.ok("status" in stopped);
  assert.equal(stopped.status, "not-run", "replacement between the opening read and closing arm is also excluded");
  assert.equal(stopped.reason, "page-left-after-open");
  assert.deepEqual(stopped.expected, opening.expected);
  assert.deepEqual(stopped.observed, { document: 2000, url: replacement.url });
  assert.equal(stopped.tasks, undefined);
  assert.deepEqual(timeIssues([observation(stopped, 1, "press-close")], 100), []);
  for (const reason of ["navigated", "document-changed", "execution-context-destroyed"]) {
    const lost: TimeReading = { status: "incomplete", expected: opening.expected, reason };
    const result = continueTime(lost, same);
    assert.ok("status" in result);
    assert.equal(result.status, "not-run", reason);
    assert.equal(result.reason, "page-left-after-open");
  }
  const failure: TimeReading = { status: "incomplete", reason: "execution-context-destroyed" };
  assert.deepEqual(continueTime(opening, failure), failure, "a failed closing arm remains explicitly incomplete");
  assert.deepEqual(continueTime(failure, failure), { status: "not-run", reason: "page-left-after-open" }, "missing identities are not fabricated");
});

test("one task over budget survives clean repetitions; exact budget and below pass without rounding", () => {
  const runs = [observation(measured(100.001)), observation(measured(99.999), 2), observation(measured(100), 3)];
  const issues = timeIssues(runs, 100);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.value, 100.001);
  assert.deepEqual(issues[0]?.samples, [100.001, 99.999, 100]);
  assert.deepEqual(timeIssues(runs.slice(1), 100), []);
});

test("incomplete and unsupported runs produce nonnumeric findings independently of clean runs; not-run does not", () => {
  const runs = [
    observation(measured(80)),
    observation({ status: "unsupported", reason: "longtask-unavailable" }, 2),
    observation({ status: "incomplete", reason: "navigated" }, 3),
    observation({ status: "incomplete", reason: "document-changed" }, 4),
    observation({ status: "not-run", reason: "unsafe-or-unavailable" }, 5),
  ];
  const issues = timeIssues(runs, 100);
  assert.equal(issues.length, 2, "one finding per phase/target/status, not per run");
  assert.ok(issues.every((issue) => issue.rule === "long-task" && issue.value === undefined));
  assert.match(issues.find((issue) => issue.element.includes("incomplete"))!.detail, /navigated.*document-changed/);
  assert.equal(timeIssues([observation(measured(120)), observation(measured(130), 1, "press-close")], 100).length, 2);
});

test("observation ordering retains viewport, phase, run, and document readings in shard-independent order", () => {
  const a = observation(measured(120), 2);
  const b = observation(measured(110), 1);
  const c = { ...a, width: 1440 };
  assert.deepEqual([a, c, b].sort(compareTimeObservations), [b, a, c]);
  const twins = [a, { ...a, dpr: 1 }, { ...a, viewport: { width: 390, height: 900 } }, { ...a, reading: measured(130) }];
  assert.deepEqual([...twins].reverse().sort(compareTimeObservations), [...twins].sort(compareTimeObservations));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});
