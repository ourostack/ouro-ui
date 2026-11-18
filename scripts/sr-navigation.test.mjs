import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { NAVIGATION_HUNG, NAVIGATION_RETRY_PREFIX, NAVIGATION_TIMEOUT_MS, navigateWithRetry, waitUntil } from "../registry/ouro/e2e/screen-reader/navigation.ts";
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
