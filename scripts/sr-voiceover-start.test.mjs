import assert from "node:assert/strict";
import { test } from "node:test";
import { pollUntil, RETRY_PREFIX, startWithRetry } from "../registry/ouro/e2e/screen-reader/voiceover-start.ts";
import { classify, startRetries, why } from "./sr-classify.mjs";

// The retry around VoiceOver's start (registry/ouro/e2e/screen-reader/voiceover-start.ts), with the
// start, the settle and the log injected, so it runs here without VoiceOver.

/** A start that fails its first `failures` calls with `message`, counting every call. */
const starts = (failures, message = "VoiceOver cannot be started") => {
  const calls = { count: 0 };
  const start = async () => {
    calls.count++;
    if (calls.count <= failures) throw new Error(message);
  };
  return { calls, start };
};

test("startWithRetry: a start that succeeds first is one call, with nothing logged and nothing settled", async () => {
  const { calls, start } = starts(0);
  const lines = [];
  let settled = 0;
  await startWithRetry({ start, settle: async () => void settled++, log: (line) => lines.push(line) });
  assert.equal(calls.count, 1);
  assert.deepEqual(lines, []);
  assert.equal(settled, 0);
});

test("startWithRetry: a start that fails once then succeeds is two calls, settled between them, with one retry logged with its error", async () => {
  const { calls, start } = starts(1);
  const lines = [];
  const order = [];
  await startWithRetry({
    start: async () => {
      order.push("start");
      await start();
    },
    settle: async () => void order.push("settle"),
    log: (line) => lines.push(line),
  });
  assert.equal(calls.count, 2);
  assert.deepEqual(order, ["start", "settle", "start"]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[sr\] start retry: VoiceOver's start failed on try 1 of 2 \(VoiceOver cannot be started\); /);
  assert.equal(startRetries(lines[0]), 1);
});

test("startWithRetry: a start that fails twice throws the infrastructure signature after two calls and one retry, and the classifier reads it as infrastructure", async () => {
  const { calls, start } = starts(2);
  const lines = [];
  const failure = await startWithRetry({ start, settle: async () => {}, log: (line) => lines.push(line) }).then(
    () => assert.fail("two failed starts must throw"),
    (error) => error,
  );
  assert.equal(calls.count, 2, "no third try");
  assert.equal(lines.length, 1);
  assert.equal(failure.message, "VoiceOver did not start on 2 tries: VoiceOver cannot be started");
  assert.equal(failure.cause.message, "VoiceOver cannot be started");
  // The lane's log: the retry's line, then Playwright's report of the thrown error.
  const log = `${lines[0]}\n  ✘  1 [voiceover] › registry/ouro/e2e/screen-reader/toast.sr.spec.ts:8:1 › Toast is announced\n    Error: ${failure.message}\n  1 failed`;
  assert.equal(classify(log, 1), "infrastructure");
  assert.equal(why(log), "VoiceOver did not start");
});

test("startWithRetry: an error with several lines is logged and thrown by its first line", async () => {
  const lines = [];
  const error = await startWithRetry({
    start: async () => {
      throw new Error("VoiceOver cannot be started\nat start (VoiceOver.js:1)");
    },
    settle: async () => {},
    log: (line) => lines.push(line),
    tries: 1,
  }).catch((caught) => caught);
  assert.equal(error.message, "VoiceOver did not start on 1 tries: VoiceOver cannot be started");
  assert.deepEqual(lines, []);
});

test("startWithRetry: a retry's line is no finding, so a test's own failure after a recovered start decides the class", () => {
  const retried = `${RETRY_PREFIX} VoiceOver's start failed on try 1 of 2 (VoiceOver cannot be started); trying again once its process has exited.`;
  const assertionFailure = "  ✘  3 [voiceover] › registry/ouro/e2e/screen-reader/dialog.sr.spec.ts:9:1 › Dialog\n    Error: [sr] no utterance matched /edit recipe/i; heard: \"Edit\"\n  1 failed";
  assert.equal(classify(`${retried}\n${assertionFailure}`, 1), "accessibility");
  assert.equal(classify(`${retried}\n  1 passed`, 0), "pass");
  // Only the retry's line, and a failed run: nothing ran, so the runner is to blame.
  assert.equal(classify(retried, 1), "infrastructure");
  assert.equal(why(retried), "the tests never ran");
});

test("startWithRetry: the start-retry line the fixture writes is the one the classifier counts", () => {
  assert.equal(startRetries(`${RETRY_PREFIX} anything\n${RETRY_PREFIX} again\nnot one`), 2);
  assert.equal(startRetries("[sr] first utterance: \"Save\""), 0);
});

test("pollUntil: resolves true as soon as its check holds, and false once the timeout has passed", async () => {
  let checks = 0;
  assert.equal(
    await pollUntil(async () => ++checks === 3, 5_000, 1),
    true,
  );
  assert.equal(checks, 3);
  let late = 0;
  assert.equal(await pollUntil(async () => (late++, false), 30, 5), false);
  assert.ok(late > 1, "it checks again until the timeout, not once");
});
