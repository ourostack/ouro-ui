import assert from "node:assert/strict";
import { test } from "node:test";
import { cannotStart, deepestCause, installVoiceOverStartRetry, START_DIAGNOSTICS_PREFIX, START_RETRY_PREFIX, startWithRetry } from "../registry/ouro/e2e/screen-reader/start-retry.ts";
import { classify, why } from "./sr-classify.mjs";

// The VoiceOver start retry (registry/ouro/e2e/screen-reader/start-retry.ts), with its steps injected,
// so it runs here without VoiceOver. Each start is scripted: "ok" starts, and any other outcome is
// thrown as it is given.

/** Guidepup's error for a start that failed, with the AppleScript error under it (as the lane's log shows it). */
const cannotBeStarted = () =>
  new Error("VoiceOver cannot be started", {
    cause: new Error("Unable to activate application: VoiceOver", {
      cause: new Error("56:97: execution error: VoiceOver got an error: Application isn't running. (-600)"),
    }),
  });

/**
 * A fake VoiceOver. `starts` are the outcomes of its starts, in turn ("ok" or an error); `runningPolls`
 * is how many times it reports itself running before it exits. Each step is recorded in `order`.
 */
function fakeVoiceOver({ starts = ["ok"], runningPolls = 0, diagnose = () => ["pgrep -fl VoiceOver: none"] } = {}) {
  const order = [];
  const lines = [];
  let startCalls = 0;
  let polls = 0;
  const attempts = {
    start: async () => {
      order.push("start");
      const outcome = starts[startCalls++] ?? "ok";
      if (outcome !== "ok") throw outcome;
    },
    // After a failed start Guidepup has nothing to stop: its stop says VoiceOver is not running.
    stop: async () => {
      order.push("stop");
      throw new Error("VoiceOver not running");
    },
    running: async () => {
      order.push("running?");
      return polls++ < runningPolls;
    },
    kill: async () => void order.push("kill"),
    wait: async (ms) => void order.push(`wait ${ms}`),
    diagnose: async () => {
      order.push("diagnose");
      return diagnose();
    },
    log: (line) => lines.push(line),
  };
  return { order, lines, attempts };
}

test("startWithRetry: a start that cannot begin is logged, settled and started again once, and that start stands", async () => {
  const voiceOver = fakeVoiceOver({ starts: [cannotBeStarted(), "ok"] });
  await startWithRetry(voiceOver.attempts);
  assert.deepEqual(voiceOver.order, ["start", "diagnose", "stop", "running?", "wait 15000", "start"]);
  assert.equal(
    voiceOver.lines[0],
    `${START_RETRY_PREFIX} VoiceOver could not be started (56:97: execution error: VoiceOver got an error: Application isn't running. (-600)); waiting for it to settle, then starting it again.`,
  );
  assert.equal(voiceOver.lines[1], `${START_DIAGNOSTICS_PREFIX} pgrep -fl VoiceOver: none`);
  assert.equal(voiceOver.lines.length, 2);
});

test("startWithRetry: a start that fails in another way is not retried, and its error reaches the caller as it was thrown", async () => {
  const other = new Error("Timed out waiting for the page");
  const voiceOver = fakeVoiceOver({ starts: [other, "ok"] });
  await assert.rejects(startWithRetry(voiceOver.attempts), (error) => error === other);
  assert.deepEqual(voiceOver.order, ["start"]);
  assert.deepEqual(voiceOver.lines, []);
});

test("startWithRetry: a second start that fails is thrown unchanged, and VoiceOver is not started a third time", async () => {
  const second = cannotBeStarted();
  const voiceOver = fakeVoiceOver({ starts: [cannotBeStarted(), second, "ok"] });
  await assert.rejects(startWithRetry(voiceOver.attempts), (error) => error === second);
  assert.equal(voiceOver.order.filter((step) => step === "start").length, 2);
  // The retry's line and the second error, as the lane's log shows them: infrastructure, VoiceOver did not start.
  const log = `${voiceOver.lines[0]}\n  ✘  3 [voiceover] › registry/ouro/e2e/screen-reader/toast.sr.spec.ts:8:1 › Toast\n    Error: ${second.message}\n  1 failed`;
  assert.equal(classify(log, 1), "infrastructure");
  assert.equal(why(log), "VoiceOver did not start");
});

test("cannotStart: a can't-start message or the -600 in a cause is detected; any other error is not", () => {
  assert.equal(cannotStart(new Error("Unable to activate application: VoiceOver", { cause: new Error("Application isn't running. (-600)") })), true);
  assert.equal(cannotStart(new Error("VoiceOver cannot be started")), true);
  assert.equal(cannotStart(new Error("Unable to activate application: VoiceOver")), false);
  assert.equal(cannotStart(new Error("locator.focus: element is detached")), false);
  assert.equal(cannotStart(undefined), false);
});

test("deepestCause: the error at the end of the chain is the one the retry's line names", () => {
  assert.equal(deepestCause(cannotBeStarted()).message, "56:97: execution error: VoiceOver got an error: Application isn't running. (-600)");
  const plain = new Error("no cause");
  assert.equal(deepestCause(plain), plain);
});

test("startWithRetry: a start whose only sign is the -600 deep in its cause chain is retried, and the cause is named", async () => {
  const bare = new Error("Unable to activate application: VoiceOver", { cause: new Error("Command failed: osascript\n56:97: execution error: Application isn't running. (-600)") });
  const voiceOver = fakeVoiceOver({ starts: [bare, "ok"] });
  await startWithRetry(voiceOver.attempts);
  assert.deepEqual(voiceOver.order.filter((step) => step === "start"), ["start", "start"]);
  assert.equal(voiceOver.lines[0], `${START_RETRY_PREFIX} VoiceOver could not be started (Command failed: osascript); waiting for it to settle, then starting it again.`);
});

test("startWithRetry: a VoiceOver still running after ten seconds of polls is killed before the settle", async () => {
  const voiceOver = fakeVoiceOver({ starts: [cannotBeStarted(), "ok"], runningPolls: Infinity });
  await startWithRetry(voiceOver.attempts);
  const { order } = voiceOver;
  assert.ok(order.indexOf("stop") < order.indexOf("kill"), "VoiceOver is stopped first, then killed");
  assert.ok(order.indexOf("kill") < order.indexOf("wait 15000"), "the kill comes before the settle");
  assert.equal(order.filter((step) => step === "wait 500").length, 20, "ten seconds of polls, 500 ms apart");
  assert.equal(order.at(-1), "start");
});

test("startWithRetry: a VoiceOver that exits within its polls is not killed", async () => {
  const voiceOver = fakeVoiceOver({ starts: [cannotBeStarted(), "ok"], runningPolls: 3 });
  await startWithRetry(voiceOver.attempts);
  assert.equal(voiceOver.order.includes("kill"), false);
  assert.deepEqual(voiceOver.order.slice(-2), ["wait 15000", "start"]);
});

test("startWithRetry: diagnostics that cannot be taken do not stop the retry, and only its own line is logged", async () => {
  const voiceOver = fakeVoiceOver({
    starts: [cannotBeStarted(), "ok"],
    diagnose: () => {
      throw new Error("pgrep: not found");
    },
  });
  await startWithRetry(voiceOver.attempts);
  assert.equal(voiceOver.order.at(-1), "start", "the retry started again");
  assert.equal(voiceOver.lines.length, 1);
});

test("installVoiceOverStartRetry: a start that works is made with the options it was given, once even when installed twice", async () => {
  const given = [];
  const voiceOver = {
    start: async (options) => void given.push(options),
    stop: async () => {},
  };
  installVoiceOverStartRetry(voiceOver, () => {});
  installVoiceOverStartRetry(voiceOver, () => {});
  await voiceOver.start({ capture: "initial" });
  assert.deepEqual(given, [{ capture: "initial" }]);
});
