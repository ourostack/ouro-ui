import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_EXIT_CODES, defineExitCodes } from "./exit-codes.ts";
import { nextStep } from "./outcome.ts";
import { DEFAULT_WAIT_EXITS, formatDuration, isWait, parseDuration, validateWait, wait, waitExit, waitFor, waitText, type AxEvent, type WaitRead } from "./wait.ts";

const AT = "2026-10-30T20:00:00.000Z";
const again = nextStep("tool watch abc123 --cursor 17", "wait again from here");
const timedOut = wait({ for: "a reply in Design sync", state: "timed-out", since: AT, cursor: "17", fresh: { state: "live", asOf: AT }, resume: again });
const reply: AxEvent = { cursor: "18", type: "message", at: AT, by: "Riley", target: { kind: "conversation", id: "c1" }, summary: "Lakeside room, 9:30" };

test("wait builds with defaults and validates", () => {
  const w = wait({ for: "x", state: "gone", since: AT });
  assert.deepEqual(w, { ax: "wait/1", for: "x", target: null, state: "gone", since: AT, until: null, cursor: null, events: [], fresh: null, resume: null, reason: null, callback: null, next: [] });
  assert.ok(isWait(w));
  assert.deepEqual(validateWait(w), { ok: true, errors: [], warnings: ["no freshness: nothing seen is not the same as nothing happened"] });
  assert.deepEqual(validateWait(timedOut), { ok: true, errors: [], warnings: [] });
  for (const v of [null, { ax: "wait/1", state: "done" }, { ax: "wait/1", state: 1 }]) assert.match(validateWait(v).errors[0]!, /^not a wait\/1 envelope/);
});

test("validateWait asks a wait that can go on how to resume, and a satisfied one what happened", () => {
  const r = validateWait({ ...timedOut, for: "", since: "", state: "waiting", resume: null, cursor: null, next: [{}] });
  assert.deepEqual(r.errors, ["for is empty: say what is awaited", "since is empty", "waiting needs resume: the exact command that waits again from the cursor", "every next step needs a command and a why"]);
  assert.deepEqual(r.warnings, ["no cursor: a resumed wait may miss or repeat events"]);
  assert.deepEqual(validateWait({ ...timedOut, state: "satisfied" }).errors, ["satisfied, but no event says what happened"]);
  assert.deepEqual(validateWait({ ...timedOut, events: "none" }).errors, ["events is a list"]);
  assert.deepEqual(validateWait({ ...timedOut, state: "gone", resume: { command: "x" } }).errors, ["resume needs a command and a why"]);
  assert.ok(validateWait({ ...timedOut, state: "satisfied", events: [reply] }).ok);
  assert.deepEqual(validateWait({ ...timedOut, next: "x" }).errors, ["every next step needs a command and a why"]);
});

test("waitExit and waitText", () => {
  const exits = defineExitCodes([...BASE_EXIT_CODES, { code: 3, name: "waited", short: "waited and it didn't happen", meaning: "w" }]);
  assert.equal(waitExit(timedOut, exits), 1);
  assert.equal(waitExit(timedOut, exits, { ...DEFAULT_WAIT_EXITS, "timed-out": "waited" }), 3);
  assert.equal(waitExit({ ...timedOut, state: "satisfied" }, exits), 0);
  assert.equal(waitText({ ...timedOut, until: "10:05" }), "Nothing yet: a reply in Design sync, waited until 10:05.\nResume: tool watch abc123 --cursor 17  (wait again from here)");
  assert.equal(waitText(timedOut).split("\n")[0], "Nothing yet: a reply in Design sync, waited until the limit.");
  assert.equal(waitText(wait({ for: "a reply", state: "satisfied", since: AT, events: [reply], fresh: { state: "stale", asOf: AT }, next: [nextStep("tool look c1", "read it")] })), `Happened: a reply.\n${AT} Riley: Lakeside room, 9:30\nFreshness: stale as of ${AT}.\nNext: tool look c1  (read it)`);
  assert.equal(waitText(wait({ for: "a reply", state: "waiting", since: AT, fresh: { state: "stale", asOf: null } })), "Waiting for a reply.\nFreshness: stale.");
  assert.equal(waitText(wait({ for: "a reply", state: "gone", since: AT, reason: "the chat was deleted." })), "It can't happen any more: a reply: the chat was deleted.");
  assert.equal(waitText(wait({ for: "a reply", state: "gone", since: AT })), "It can't happen any more: a reply.");
});

test("parseDuration and formatDuration read and write the same durations", () => {
  assert.deepEqual(["90s", "2m", "1h", "500ms", "30", "1.5m", " 2m ", "soon", "-1s", ""].map(parseDuration), [90_000, 120_000, 3_600_000, 500, 30_000, 90_000, 120_000, null, null, null]);
  assert.deepEqual([120_000, 90_000, 3_600_000, 500, 1500].map(formatDuration), ["2m", "90s", "1h", "500ms", "1500ms"]);
});

/** A fake clock and a source whose reads come from a script. */
function scripted(reads: WaitRead[]) {
  let t = Date.parse(AT);
  const seen: (string | null)[] = [];
  return {
    seen,
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    read: async (cursor: string | null) => {
      seen.push(cursor);
      return reads.shift() ?? { events: [], cursor };
    },
  };
}

test("waitFor: from now, it ignores what was there, then returns the first matching event", async () => {
  const s = scripted([{ events: [reply], cursor: "17", fresh: { state: "live", asOf: AT } }, { events: [], cursor: "17" }, { events: [{ ...reply, by: "you" }, reply], cursor: "19" }]);
  const w = await waitFor({ for: "a reply", target: reply.target, timeoutMs: 60_000, read: s.read, match: (e) => e.by !== "you", resume: (c) => nextStep(`tool watch c1 --cursor ${c}`, "again"), next: () => [nextStep("tool look c1", "read it")], now: s.now, sleep: s.sleep });
  assert.equal(w.state, "satisfied");
  assert.deepEqual(w.events, [reply]);
  assert.equal(w.cursor, "19");
  assert.deepEqual(w.fresh, { state: "live", asOf: AT });
  assert.deepEqual(s.seen, [null, "17", "17"]);
  assert.equal(w.since, AT);
  assert.equal(w.until, new Date(Date.parse(AT) + 60_000).toISOString());
  assert.deepEqual(w.next, [nextStep("tool look c1", "read it")]);
  assert.ok(validateWait(w).ok);
});

test("waitFor: from a cursor, until the time limit, then the command that resumes", async () => {
  const s = scripted([]);
  const w = await waitFor({ for: "a reply", target: null, cursor: "17", timeoutMs: 2500, intervalMs: 1000, read: s.read, resume: (c) => nextStep(`tool watch c1 --cursor ${c}`, "again"), now: s.now, sleep: s.sleep });
  assert.equal(w.state, "timed-out");
  assert.deepEqual(w.resume, nextStep("tool watch c1 --cursor 17", "again"));
  assert.deepEqual(s.seen, ["17", "17", "17", "17"]);
  assert.deepEqual(w.next, []);
});

test("waitFor: a target that is gone ends the wait with the reason; the real clock and sleep work", async () => {
  const gone = await waitFor({ for: "a reply", target: null, cursor: "1", timeoutMs: 10, read: async () => ({ events: [], cursor: null, gone: "the chat was deleted" }), resume: () => again, next: () => [nextStep("tool conversations", "pick another")] });
  assert.equal(gone.state, "gone");
  assert.equal(gone.reason, "the chat was deleted");
  assert.equal(gone.cursor, "1");
  assert.equal(gone.next.length, 1);
  const goneQuiet = await waitFor({ for: "a reply", target: null, cursor: "1", timeoutMs: 10, read: async () => ({ events: [], cursor: "1", gone: "left" }), resume: () => again });
  assert.deepEqual(goneQuiet.next, []);
  const real = await waitFor({ for: "a reply", target: null, cursor: "1", timeoutMs: 15, intervalMs: 5, read: async () => ({ events: [], cursor: "1" }), resume: () => again });
  assert.equal(real.state, "timed-out");
  const negative = await waitFor({ for: "x", target: null, cursor: "1", timeoutMs: -5, read: async () => ({ events: [], cursor: "1" }), resume: () => again });
  assert.equal(negative.state, "timed-out");
});
