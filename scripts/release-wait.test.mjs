import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMIT_MINUTES, landed, pendingWait } from "./release-wait.mjs";

// The commits, their change lines and the clock are passed in: no git, no network.
const NOW = Date.UTC(2026, 10, 17, 12, 0, 0);
const at = (minutesAgo) => Math.floor(NOW / 1000) - minutesAgo * 60;
const TAG_LINES = ["- Released: an earlier change"];
const linesFrom = (commits) => (commit) => commits.find((c) => c.sha === commit.sha).lines;

test("release wait: a fresh change ten minutes old, after a pin-only commit two hours old, reads 10 minutes and is under", () => {
  const commits = [
    { sha: "pin", time: at(120), lines: [] },
    { sha: "fresh", time: at(10), lines: ["- New: a change"] },
  ];
  assert.deepEqual(pendingWait(commits, TAG_LINES, linesFrom(commits), NOW), { sha: "fresh", minutes: 10, over: false });
});

test("release wait: a fresh change over an hour old is over the limit", () => {
  assert.equal(LIMIT_MINUTES, 60);
  const commits = [
    { sha: "change", time: at(61), lines: ["- New: a change"] },
    { sha: "later", time: at(5), lines: [] },
  ];
  assert.deepEqual(pendingWait(commits, TAG_LINES, linesFrom(commits), NOW), { sha: "change", minutes: 61, over: true });
});

test("release wait: no commit brings a fresh change line, so nothing is waiting", () => {
  const commits = [
    { sha: "pin", time: at(120), lines: TAG_LINES },
    { sha: "ci", time: at(30), lines: [] },
  ];
  assert.equal(pendingWait(commits, TAG_LINES, linesFrom(commits), NOW), null);
  assert.equal(pendingWait([], TAG_LINES, () => [], NOW), null);
});

test("release wait: a queued commit counts from when it landed on main, whatever its committer time", () => {
  const commits = [{ sha: "queued", time: NOW / 1000 - 71 * 60 }];
  const runs = [{ sha: "queued", createdAt: new Date(NOW - 4 * 60_000).toISOString() }];
  assert.deepEqual(pendingWait(commits, TAG_LINES, () => ["- New: x"], NOW, LIMIT_MINUTES, runs), { sha: "queued", minutes: 4, over: false });
  assert.equal(pendingWait(commits, TAG_LINES, () => ["- New: x"], NOW).minutes, 71, "with no push run the committer time stands");
  assert.deepEqual(landed(commits[0], [{ sha: "other", createdAt: "2026-01-01T00:00:00Z" }]), commits[0]);
});
