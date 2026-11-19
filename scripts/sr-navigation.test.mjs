import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { NAVIGATION_HUNG, NAVIGATION_OUTSIDE, NAVIGATION_RETRY_PREFIX, NAVIGATION_TIMEOUT_MS, navigateWithRetry, voiceOverGone, waitUntil } from "../registry/ouro/e2e/screen-reader/navigation.ts";
import { classify, navigationSummary, why } from "./sr-classify.mjs";

// The bounded navigation to the page (registry/ouro/e2e/screen-reader/navigation.ts), with VoiceOver
// injected, so it runs here without VoiceOver. Each navigation is scripted: "ok" finishes at once,
// "hang" never finishes, "late-reject" finishes with an error 30 ms later, "fail" fails at once.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => readFileSync(join(root, "scripts/fixtures/sr-logs", name), "utf8");

/** A fake VoiceOver that records each call in order, and gives its navigations the scripted outcomes. */
function fakeVoiceOver(...navigations) {
  const order = [];
  const lines = [];
  let calls = 0;
  return {
    order,
    lines,
    navigate: () => {
      const step = navigations[calls++] ?? "ok";
      order.push("navigate");
      if (step === "hang") return new Promise(() => {});
      if (step === "late-reject")
        return sleep(30).then(() => {
          order.push("hung ended");
          throw new Error("VoiceOver not running");
        });
      if (step === "fail") return Promise.reject(new Error("locator.focus: element is detached"));
      // As Guidepup throws when VoiceOver quit between tests (#2084).
      if (step === "gone") return Promise.reject(new Error("Unable to send keys: to application: VoiceOver\nCommand failed: /usr/bin/osascript\n60:71: execution error: System Events got an error: Application isn’t running. (-600)"));
      return Promise.resolve();
    },
    stop: async () => void order.push("stop"),
    start: async () => void order.push("start"),
    // Bounded, as the real settle is: a navigation that never ends does not hold up the restart.
    settle: async (hung) => {
      order.push("settle");
      await Promise.race([hung, sleep(50)]);
    },
    log: (line) => lines.push(line),
  };
}

test("navigateWithRetry: a navigation that is done in time is one navigation, with no retry", async () => {
  const voiceOver = fakeVoiceOver("ok");
  await navigateWithRetry({ ...voiceOver, timeoutMs: 20 });
  assert.deepEqual(voiceOver.order, ["navigate"]);
  assert.deepEqual(voiceOver.lines, []);
});

test("navigateWithRetry: a navigation that hangs once is stopped, settled and started again, then navigated once more", async () => {
  const voiceOver = fakeVoiceOver("late-reject", "ok");
  await navigateWithRetry({ ...voiceOver, timeoutMs: 10 });
  // The restart waits for the hung navigation to end: its error comes before VoiceOver starts again.
  assert.deepEqual(voiceOver.order, ["navigate", "stop", "settle", "hung ended", "start", "navigate"]);
  assert.equal(voiceOver.lines.length, 1);
  assert.match(voiceOver.lines[0].slice(NAVIGATION_RETRY_PREFIX.length), /^ VoiceOver's navigation hung for [\d.]+ s on try 1 of 2; /);
  assert.ok(voiceOver.lines[0].startsWith(NAVIGATION_RETRY_PREFIX));
});

test("navigateWithRetry: a navigation that hangs on every try throws the infrastructure signature after one retry, and is not started a third time", async () => {
  const voiceOver = fakeVoiceOver("hang", "hang");
  const error = await navigateWithRetry({ ...voiceOver, timeoutMs: 10 }).then(
    () => assert.fail("two hangs must throw"),
    (caught) => caught,
  );
  assert.match(error.message, new RegExp(`^${NAVIGATION_HUNG}: its navigation hung on 2 tries of [\\d.]+ s each$`));
  assert.deepEqual(voiceOver.order, ["navigate", "stop", "settle", "start", "navigate"]);
  assert.equal(voiceOver.lines.length, 1);
  // The lane's log holds the retry's line and the error the test threw: infrastructure, with that reason.
  const log = `${voiceOver.lines[0]}\n  ✘  12 [voiceover] › registry/ouro/e2e/screen-reader/route-progress.sr.spec.ts:8:1 › RouteProgress\n    Error: ${error.message}\n  1 failed`;
  assert.equal(classify(log, 1), "infrastructure");
  assert.equal(why(log), NAVIGATION_HUNG);
});

test("navigateWithRetry: a navigation that fails outright is not retried, and its error reaches the test", async () => {
  const voiceOver = fakeVoiceOver("fail");
  await assert.rejects(navigateWithRetry({ ...voiceOver, timeoutMs: 20 }), /locator\.focus: element is detached/);
  assert.deepEqual(voiceOver.order, ["navigate"]);
});

test("navigateWithRetry: a navigation that finds VoiceOver gone (-600) starts it again and navigates once more, logged as a retry", async () => {
  const voiceOver = fakeVoiceOver("gone", "ok");
  await navigateWithRetry({ ...voiceOver, timeoutMs: 20 });
  assert.deepEqual(voiceOver.order, ["navigate", "stop", "settle", "start", "navigate"]);
  assert.equal(voiceOver.lines.length, 1);
  assert.match(voiceOver.lines[0], /^\[sr\] navigation retry: VoiceOver had quit \(Unable to send keys: to application: VoiceOver\) on try 1 of 2; /);
  assert.equal(navigationSummary(`${voiceOver.lines[0]}\n  ✓   1 [voiceover] › registry/ouro/e2e/screen-reader/dialog.sr.spec.ts:8:1 › Dialog (1.0s)`), "VoiceOver navigation: 1 retry in 1 tests that ran (1 in 1). Too few tests to judge against 1 in 50 alone: #2014 counts the rate across runs.");
});

test("navigateWithRetry: VoiceOver gone on both tries fails as infrastructure, and is not started a third time", async () => {
  const voiceOver = fakeVoiceOver("gone", "gone");
  const error = await navigateWithRetry({ ...voiceOver, timeoutMs: 20 }).then(
    () => assert.fail("two quits must throw"),
    (caught) => caught,
  );
  assert.match(error.message, new RegExp(`^${NAVIGATION_HUNG}: VoiceOver had quit \\(.+\\) on try 2 of 2$`));
  assert.deepEqual(voiceOver.order, ["navigate", "stop", "settle", "start", "navigate"]);
  const log = `${voiceOver.lines[0]}\n  ✘   8 [voiceover] › registry/ouro/e2e/screen-reader/dialog.sr.spec.ts:8:1 › Dialog\n    Error: ${error.message}\n  1 failed`;
  assert.equal(classify(log, 1), "infrastructure");
});

test("navigateWithRetry: a navigation that leaves VoiceOver outside the web area navigates once more, without restarting it", async () => {
  const voiceOver = fakeVoiceOver("ok", "ok");
  const said = ["", "Button Save to cookbook"];
  const outside = async () => (said.shift() === "" ? 'VoiceOver stayed outside the page\'s web area (it said "")' : null);
  await navigateWithRetry({ ...voiceOver, outside, timeoutMs: 20 });
  assert.deepEqual(voiceOver.order, ["navigate", "navigate"]);
  assert.equal(voiceOver.lines.length, 1);
  assert.match(voiceOver.lines[0], new RegExp(`^${NAVIGATION_RETRY_PREFIX.replace(/[[\]]/g, "\\$&")} VoiceOver stayed outside the page's web area \\(it said ""\\) on try 1 of 2; navigating again\\.$`));
});

test("navigateWithRetry: VoiceOver outside the web area on both tries fails as infrastructure, and is not navigated a third time", async () => {
  const voiceOver = fakeVoiceOver("ok", "ok", "ok");
  const outside = async () => 'VoiceOver stayed outside the page\'s web area (it said "You are currently on web content.")';
  const failure = await navigateWithRetry({ ...voiceOver, outside, timeoutMs: 20 }).then(
    () => null,
    (error) => error.message,
  );
  assert.deepEqual(voiceOver.order, ["navigate", "navigate"]);
  assert.ok(failure.startsWith(`${NAVIGATION_OUTSIDE}: `), failure);
  const log = `  ✘   2 [voiceover] › registry/ouro/e2e/screen-reader/button.sr.spec.ts:8:1 › Button\n    Error: ${failure}\n`;
  assert.equal(classify(log, 1), "infrastructure");
  assert.match(why(log), /VoiceOver never entered the page's web area/);
});

test("voiceOverGone: AppleScript's -600, and -609 for a lost connection to System Events, are VoiceOver gone; a test's own error is not", () => {
  assert.equal(voiceOverGone(new Error("System Events got an error: Application isn’t running. (-600)")), true);
  assert.equal(voiceOverGone(new Error("Application isn't running")), true);
  assert.equal(voiceOverGone(new Error("locator.focus: element is detached")), false);
  assert.equal(voiceOverGone("(-600)"), true);
  // Main's run 44605928118 (#2453): osascript lost System Events while the navigation pressed VoiceOver's keys.
  assert.equal(voiceOverGone(new Error("Unable to send keys: to application: VoiceOver\nCommand failed: /usr/bin/osascript\n60:71: execution error: System Events got an error: Connection is invalid. (-609)")), true);
});

test("navigateWithRetry: a stop that fails is logged, and VoiceOver still starts again", async () => {
  const voiceOver = fakeVoiceOver("hang", "ok");
  voiceOver.stop = async () => {
    voiceOver.order.push("stop");
    throw new Error("VoiceOver not running");
  };
  await navigateWithRetry({ ...voiceOver, timeoutMs: 10 });
  assert.deepEqual(voiceOver.order, ["navigate", "stop", "settle", "start", "navigate"]);
  assert.match(voiceOver.lines[0], /\(stop failed: VoiceOver not running\); /);
});

test("waitUntil: resolves true once its check holds, and false when its time runs out", async () => {
  let checks = 0;
  assert.equal(
    await waitUntil(async () => ++checks === 3, 5_000, 1),
    true,
  );
  assert.equal(checks, 3);
  assert.equal(await waitUntil(async () => false, 30, 5), false);
});

test("the navigation bound is above every start-to-first-utterance gap measured on main, and a third of a test's timeout at most", () => {
  const { gapsSeconds } = JSON.parse(fixture("voiceover-passing-gaps.json"));
  assert.equal(gapsSeconds.length, 132);
  assert.equal(Math.min(...gapsSeconds), 13.1);
  assert.equal(Math.max(...gapsSeconds), 35.3);
  assert.ok(Math.max(...gapsSeconds) * 1000 < NAVIGATION_TIMEOUT_MS, "a normal navigation must not trip the bound");
  assert.match(readFileSync(join(root, "playwright.screen-reader.config.ts"), "utf8"), /timeout: 3 \* 60_000,/);
  assert.ok(NAVIGATION_TIMEOUT_MS <= (3 * 60_000) / 3);
});

test("the recorded #2014 failures: 13 navigation hangs, 12 of them past the middle of their run, the first at test 2", () => {
  const { jobs } = JSON.parse(fixture("voiceover-2014-failures.json"));
  assert.equal(jobs.length, 18);
  const hangs = jobs.filter((job) => job.kind === "navigation hang");
  assert.equal(hangs.length, 13);
  assert.equal(hangs.filter((job) => job.failed_test / job.tests > 0.5).length, 12);
  assert.equal(Math.min(...hangs.map((job) => job.failed_test)), 2);
});

test("navigationSummary: the retries against the VoiceOver tests that ran, and a cause to find above 1 in 50, judged only over 50 tests or more", () => {
  const ran = (count) => Array.from({ length: count }, (_, index) => `  ✓  ${index + 2} [voiceover] › registry/ouro/e2e/screen-reader/button.sr.spec.ts:8:1 › Button (1.0s)`).join("\n");
  assert.equal(navigationSummary("no VoiceOver test ran here"), "");
  assert.equal(navigationSummary(ran(60)), "VoiceOver navigation: 0 retries in 60 tests that ran.");
  assert.equal(navigationSummary(`${NAVIGATION_RETRY_PREFIX} x\n${ran(60)}`), "VoiceOver navigation: 1 retry in 60 tests that ran (1 in 60).");
  assert.equal(
    navigationSummary(`${NAVIGATION_RETRY_PREFIX} x\n${ran(22)}`),
    "VoiceOver navigation: 1 retry in 22 tests that ran (1 in 22). Too few tests to judge against 1 in 50 alone: #2014 counts the rate across runs.",
  );
  assert.equal(
    navigationSummary(`${NAVIGATION_RETRY_PREFIX} x\n${NAVIGATION_RETRY_PREFIX} y\n${ran(60)}`),
    "VoiceOver navigation: 2 retries in 60 tests that ran (1 in 30). Above 1 in 50 tests: a cause to find, not noise.",
  );
});
