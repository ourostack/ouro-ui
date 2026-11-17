import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMIT_MINUTES, oldestCommit, waited } from "./release-wait.mjs";

// The clock and the commit times are injected: no git, no network.
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const at = (minutesAgo) => Math.floor(NOW / 1000) - minutesAgo * 60;

test("release wait: a change that has waited under an hour is under the limit", () => {
  const text = `oldsha ${at(59)}\nnewsha ${at(5)}\n`;
  assert.deepEqual(waited(oldestCommit(text), NOW), { sha: "oldsha", minutes: 59, over: false });
});

test("release wait: a change that has waited over an hour is over the limit, and the limit is 60 minutes", () => {
  assert.equal(LIMIT_MINUTES, 60);
  assert.deepEqual(waited(oldestCommit(`oldsha ${at(61)}\n`), NOW), { sha: "oldsha", minutes: 61, over: true });
  // Exactly an hour is not over: the limit is the wait that is over it.
  assert.equal(waited(oldestCommit(`oldsha ${at(60)}\n`), NOW).over, false);
});

test("release wait: no unreleased commit means nothing is waiting", () => {
  assert.equal(oldestCommit(""), null);
  assert.equal(oldestCommit("\n"), null);
});
