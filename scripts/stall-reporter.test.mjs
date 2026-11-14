import assert from "node:assert/strict";
import { test } from "node:test";
import { stallReport } from "./stall-reporter.mts";

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
    "[ouro-ui] Vitest has had no test finish for 2 min. In flight: ouro-chromium (chromium) registry/ouro/components/ouro/dialog/dialog.test.tsx > Dialog > closes on Escape (running 2m 10s); ouro-webkit (webkit) test/stories.test.tsx > stories > Button > default (running 45s)",
  );
});

test("stallReport says a file with no test running is in its setup, hooks or teardown", () => {
  const inFlight = [{ project: "ouro-touch (chromium)", file: "test/x.test.tsx", name: null, startedAt: now - 130_000 }];
  assert.match(stallReport(inFlight, now - 125_000, now, options).text, /In flight: ouro-touch \(chromium\) test\/x\.test\.tsx > \(no test running: its setup, hooks or teardown\) \(running 2m 10s\)$/);
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
    "[ouro-ui] Vitest stalled for 5 min; failing the run so the shard names what hung. In flight: ouro-chromium (chromium) test/a.test.tsx > A > hangs (running 5m 0s)",
  );
});

test("stallReport takes both thresholds in milliseconds, shown in seconds when they are not whole minutes", () => {
  const short = { warnAfter: 10_000, failAfter: 20_000 };
  assert.equal(stallReport([], now - 10_000, now, short).text, "[ouro-ui] Vitest has had no test finish for 10 s. No test in flight: the run is between files or in teardown.");
  assert.match(stallReport([], now - 20_000, now, short).text, /^\[ouro-ui\] Vitest stalled for 20 s; /);
});
