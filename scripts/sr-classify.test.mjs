import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { classify, why } from "./sr-classify.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Logs as the screen-reader lane writes them (`pnpm test:sr` through tee), trimmed to the lines
// that decide the class.
const logs = {
  pass: `Running 5 tests using 1 worker
[sr] first utterance: "Accept terms, unchecked, checkbox"
  ✓  1 [voiceover] › registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state (41.2s)
  5 passed (3.4m)`,
  wrongUtterance: `Running 5 tests using 1 worker
[sr] first utterance: "Accept terms, checkbox, not checked"
  ✘  1 [nvda] › registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state (38.0s)
    Error: expect(received).toContain(expected) // indexOf
    Expected substring: "checked"
    Received string:    "Accept terms  check box  not checked"
  1 failed`,
  missingUtterance: `[sr] first utterance: "Edit recipe, button"
  ✘  2 [voiceover] › registry/ouro/e2e/screen-reader/dialog.sr.spec.ts:9:1 › Dialog announces its title when it opens (2.0m)
    Test timeout of 120000ms exceeded.
    Error: [sr] no utterance matched /edit recipe.*dialog/i; heard: "Edit recipe, button" | "Close, button"
  1 failed`,
  voiceOverDidNotStart: `  ✘  1 [voiceover] › registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state
    Error: VoiceOver cannot be started
      at VoiceOver.start (node_modules/@guidepup/guidepup/lib/macOS/VoiceOver/VoiceOver.js:91:19)
  1 failed`,
  appleScriptDenied: `  ✘  1 [voiceover] › checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state
    Error: Command failed: osascript -e ...
    execution error: Not authorized to send Apple events to VoiceOver. (-1743)
  1 failed`,
  tccPrompt: `  ✘  1 [voiceover] › checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state
    "Terminal" would like to control "VoiceOver". Allowing control will provide access to documents and data in "VoiceOver".
    Test timeout of 120000ms exceeded.`,
  nvdaDidNotStart: `  ✘  1 [nvda] › checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state
    Error: Cannot connect to NVDA
  1 failed`,
  timeoutBeforeFirstUtterance: `Running 5 tests using 1 worker
  ✘  1 [nvda] › registry/ouro/e2e/screen-reader/checkbox.sr.spec.ts:8:1 › Checkbox announces its name, role and state (2.0m)
    Test timeout of 120000ms exceeded.
  1 failed`,
  storybookNeverReady: `Error: Timed out waiting 300000ms from config.webServer.`,
  storyMissing: `  ✘  1 [stories] › registry/ouro/e2e/screen-reader/stories.setup.ts:5:1 › every story the lane opens is in this Storybook
    Error: [sr] these story ids are not in Storybook's index.json: forms-checkbox--playground
  1 failed`,
  runnerImage: `Error: browserType.launch: Executable doesn't exist at /Users/runner/Library/Caches/ms-playwright/webkit-2359/pw_run.sh`,
  diskFull: `ENOSPC: no space left on device, write`,
};

for (const [name, log, exit, expected] of [
  ["a passing run", logs.pass, 0, "pass"],
  ["a wrong utterance", logs.wrongUtterance, 1, "accessibility"],
  ["an expected utterance that never came", logs.missingUtterance, 1, "accessibility"],
  ["a story the lane opens that Storybook lacks", logs.storyMissing, 1, "accessibility"],
  ["VoiceOver that did not start", logs.voiceOverDidNotStart, 1, "infrastructure"],
  ["AppleScript control that was denied", logs.appleScriptDenied, 1, "infrastructure"],
  ["a TCC prompt", logs.tccPrompt, 1, "infrastructure"],
  ["NVDA that did not start", logs.nvdaDidNotStart, 1, "infrastructure"],
  ["NVDA that is not installed", "Error: NVDA is not installed\n\nPlease ensure you have run:", 1, "infrastructure"],
  ["an AppleEvent timeout", "Error: AppleEvent timed out", 1, "infrastructure"],
  ["a timeout before the first utterance", logs.timeoutBeforeFirstUtterance, 1, "infrastructure"],
  ["a Storybook that never became ready", logs.storybookNeverReady, 1, "infrastructure"],
  ["a runner image without the browser", logs.runnerImage, 1, "infrastructure"],
  ["a full disk", logs.diskFull, 1, "infrastructure"],
  ["a lane that never ran its tests", "", null, "infrastructure"],
]) {
  test(`${name} is ${expected}`, () => {
    assert.equal(classify(log, exit), expected);
  });
}

test("a run whose exit code is 0 passes, and one whose exit code says it failed never passes", () => {
  assert.equal(classify(logs.pass, 0), "pass");
  assert.equal(classify(logs.pass, 1), "accessibility");
});

test("the CLI prints SR_CLASS, writes the class as a step output and fails unless the run passed", () => {
  mkdirSync(join(root, ".tmp"), { recursive: true });
  const dir = mkdtempSync(join(root, ".tmp/sr-classify-"));
  const run = (log, exit) => {
    const file = join(dir, `${Math.random()}.log`);
    if (log !== null) writeFileSync(file, log);
    const output = join(dir, `${Math.random()}.out`);
    writeFileSync(output, "");
    const result = spawnSync("node", [join(root, "scripts/sr-classify.mjs"), file, exit], { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: "" } });
    return { ...result, output: spawnSync("cat", [output], { encoding: "utf8" }).stdout };
  };
  const passed = run(logs.pass, "0");
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /^SR_CLASS=pass$/m);
  assert.equal(passed.output, "class=pass\n");
  const failed = run(logs.wrongUtterance, "1");
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^SR_CLASS=accessibility$/m);
  const missing = run(null, "");
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /^SR_CLASS=infrastructure$/m);
  assert.equal(missing.output, "class=infrastructure\n");
});

// Recorded runs (scripts/fixtures/sr-logs/): the lane's log on main, run 39235687123, where NVDA's
// Select test passed and Playwright then failed to close its browser context; and a VoiceOver run
// on feat/first-visitor (run 39234254614, attempt 1) where the Dialog spec heard only VoiceOver's
// hint as focus returned.
const recorded = (name) => readFileSync(join(root, "scripts/fixtures/sr-logs", name), "utf8");
const teardownAfterPass = recorded("nvda-teardown-after-pass.txt");
const hintOnly = recorded("voiceover-dialog-hint-only.txt");

test("a test that passed and then failed to close its browser context is infrastructure, with the reason", () => {
  assert.match(teardownAfterPass, /Error: browserContext\.close: Test ended\./);
  assert.equal(classify(teardownAfterPass, 1), "infrastructure");
  assert.equal(why(teardownAfterPass), "the browser failed to close after a test, outside any assertion");
  assert.equal(classify("  ✘  2 [nvda] › toast.sr.spec.ts:8:1 › Toast is announced\n    Error: browser.close: Test ended.\n  1 failed", 1), "infrastructure");
});

test("an expected utterance that never came stays accessibility, recorded or beside a teardown error", () => {
  assert.equal(classify(hintOnly, 1), "accessibility");
  // Both runs' failures together: the missing utterance decides.
  assert.equal(classify(`${teardownAfterPass}\n${hintOnly}`, 1), "accessibility");
  // The test body failed, and the close failed after it: the body's failure decides.
  assert.equal(classify(teardownAfterPass.replace("    Error: browserContext.close: Test ended.", "    Error: expect(locator).toBeFocused() failed\n    Error: browserContext.close: Test ended."), 1), "accessibility");
});

test("a teardown error beside any other failure, or a timeout, is not taken for the runner's", () => {
  const otherFailure = teardownAfterPass.replace("    Error: browserContext.close: Test ended.", "    Error: locator.focus: Timeout 30000ms exceeded.\n    Error: browserContext.close: Test ended.");
  assert.equal(classify(otherFailure, 1), "accessibility");
  assert.equal(classify(`${teardownAfterPass}\n    Test timeout of 180000ms exceeded.`, 1), "accessibility");
  // A failed exit with no error at all is not a teardown failure either.
  assert.equal(classify("[sr] first utterance: \"Save recipe, button\"\n  1 failed", 1), "accessibility");
});
