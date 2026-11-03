import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKS_VERSION, checksText, defineChecks, isChecksReport, printChecks, type CheckDef, type ChecksReport } from "./checks.ts";
import { BASE_EXIT_CODES, FINDINGS_EXIT_CODE } from "./exit-codes.ts";
import { hasAnsi, stripAnsi, terminalStyle, type Timers } from "./terminal.ts";

const TTY = terminalStyle({ isTTY: true }, {});
const PIPE = terminalStyle({}, {});

/** A clock that moves only when a check says so; its timers never fire, so progress stays quiet unless a test drives it. */
function heldClock() {
  let now = 0;
  const timers: Timers = { now: () => now, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
  return { timers, take: (ms: number) => void (now += ms) };
}

type Ctx = { take(ms: number): void };

const selfcheck: CheckDef<Ctx>[] = [
  { id: "send", label: "Send a plain message", run: (c) => (c.take(300), { state: "passed", detail: "sent and seen" }) },
  { id: "react", label: "React with a like", run: (c) => (c.take(1400), { state: "failed", detail: "the service refused the reaction (HTTP 400)", fix: { byHand: "Paste the report to your agent." } }) },
  { id: "unreact", label: "Remove the like", needs: ["react"], run: () => ({ state: "passed" }) },
  { id: "store", label: "Store freshness", run: () => ({ state: "warned", detail: "last synced 3 days ago", fix: { command: "app sync", why: "Sync now" } }) },
  { id: "thread", label: "Reply in a channel thread", run: () => ({ state: "skipped", detail: "others see it, so it runs on a thread you name", kind: "waiting on something you name", fix: { command: "app selfcheck --reply-in u2ynm2", why: "Run it on your own thread" } }) },
  { id: "chat", label: "Start a new chat", run: () => ({ state: "skipped", detail: "it reaches another person", kind: "by hand" }) },
];

async function run(checks: readonly CheckDef<Ctx>[], extra: Parameters<ReturnType<typeof defineChecks<Ctx>>["run"]>[1] = {}) {
  const clock = heldClock();
  const def = defineChecks<Ctx>({ command: "app selfcheck", checks });
  return def.run({ take: clock.take }, { timers: clock.timers, ...extra });
}

test("defineChecks refuses an empty list, a repeated id, an empty label and a needs that names no earlier check", () => {
  assert.throws(() => defineChecks({ command: "t doctor", checks: [] }), /t doctor declares no checks/);
  const ok = { id: "a", label: "A", run: () => ({ state: "passed" as const }) };
  assert.throws(() => defineChecks({ command: "t doctor", checks: [ok, ok] }), /the id a is used twice/);
  assert.throws(() => defineChecks({ command: "t doctor", checks: [{ ...ok, label: " " }] }), /a has no label/);
  assert.throws(() => defineChecks({ command: "t doctor", checks: [{ ...ok, needs: ["b"] }, { ...ok, id: "b" }] }), /a needs b, which is not an earlier check/);
  assert.equal(defineChecks({ command: "t doctor", checks: [ok] }).def.command, "t doctor");
});

test("a warning or failure without a fix, or with the command just run as its fix, fails the run", async () => {
  await assert.rejects(run([{ id: "x", label: "X", run: () => ({ state: "failed", detail: "broke" }) as never }]), /x failed without a fix/);
  await assert.rejects(run([{ id: "x", label: "X", run: () => ({ state: "warned", detail: "old", fix: { command: " app selfcheck ", why: "again" } }) }]), /the command just run/);
});

test("--json carries the same facts as the text: verdict, summary, counts, each check's state, detail, fix and duration, and the next steps", async () => {
  const report = await run(selfcheck, { next: [{ command: "app sync", why: "dup" }, { command: "app selfcheck --yes", why: "Run the ones it found" }] });
  assert.equal(report.ax, CHECKS_VERSION);
  assert.equal(report.verdict, "failed");
  assert.equal(report.exitCode, 3, "a finding exits with the declared findings code");
  assert.equal(report.summary, "1 of 6 checks failed: React with a like. 1 passed, 1 warned, 3 not run, in 1.7s.");
  assert.equal(report.durationMs, 1700);
  assert.deepEqual(report.counts, { passed: 1, warned: 1, failed: 1, errored: 0, skipped: 3 });
  assert.deepEqual(report.rows[1], { id: "react", label: "React with a like", state: "failed", detail: "the service refused the reaction (HTTP 400)", fix: { byHand: "Paste the report to your agent." }, kind: null, durationMs: 1400 });
  assert.deepEqual(report.rows[2], { id: "unreact", label: "Remove the like", state: "skipped", detail: "not checked: React with a like failed", fix: null, kind: "after an earlier problem", durationMs: 0 });
  assert.deepEqual(
    report.next,
    [{ command: "app sync", why: "Sync now" }, { command: "app selfcheck --yes", why: "Run the ones it found" }, { command: "app selfcheck", why: "Check again once it's fixed" }],
    "a skipped check's fix stays on its row; a repeated command is offered once; a fix by hand is followed by checking again",
  );
  const text = stripAnsi(checksText(report, TTY));
  for (const fact of [report.summary, "React with a like", "HTTP 400", "Paste the report", "app sync", "1.4s", "3 not run", "app selfcheck --yes", "Check again"]) assert.ok(text.includes(fact), fact);
  assert.ok(isChecksReport(JSON.parse(JSON.stringify(report))));
  for (const v of [null, 3, {}, { ...report, ax: "checks/2" }, { ...report, rows: {} }]) assert.equal(isChecksReport(v), false);
});

test("the text puts the verdict first, then failures with their fixes, warnings, what was not run, and the next steps", async () => {
  const report = await run(selfcheck);
  assert.equal(
    stripAnsi(checksText(report, TTY, { command: "app selfcheck" })),
    [
      "✗ 1 of 6 checks failed: React with a like. 1 passed, 1 warned, 3 not run, in 1.7s.",
      "  Not run: 1 after an earlier problem, 1 waiting on something you name, 1 by hand",
      "",
      "Failed",
      "  ✗ React with a like  1.4s",
      "    the service refused the reaction (HTTP 400)",
      "    Fix: Paste the report to your agent.",
      "",
      "Warnings",
      "  ! Store freshness",
      "    last synced 3 days ago",
      "    Fix: Sync now",
      "      app sync",
      "",
      "Still to check",
      "  ○ Reply in a channel thread",
      "    others see it, so it runs on a thread you name",
      "    Run it on your own thread",
      "      app selfcheck --reply-in u2ynm2",
      "",
      "Next",
      "  Check again once it's fixed",
      "    app selfcheck",
      "  See every check",
      "    app selfcheck --verbose",
    ].join("\n"),
  );
  const warned = await run([selfcheck[0]!, selfcheck[3]!]);
  assert.equal(warned.summary, "1 of 2 checks needs a look: Store freshness. 1 passed, in 0.3s.");
  const twoWarned = await run([selfcheck[3]!, { ...selfcheck[3]!, id: "store2" }]);
  assert.equal(twoWarned.summary, "2 of 2 checks need a look: Store freshness, Store freshness. 0 passed, in under 0.1s.");
  assert.equal(warned.exitCode, 0, "a warning still exits 0");
  const many = await run(["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), run: () => ({ state: "failed" as const, detail: "", fix: { byHand: "Look." } }) })));
  assert.equal(many.summary, "4 of 4 checks failed: A, B, C and 1 more. 0 passed, in under 0.1s.");
  assert.match(stripAnsi(checksText(many, TTY)), /^ {2}✗ A\n {4}Fix: Look\.$/m, "a failure without detail shows its fix alone");
});

test("quiet on success: the verdict alone, and every check with its time under --verbose", async () => {
  const two = await run([selfcheck[0]!, { id: "b", label: "Edit a sent message", run: () => ({ state: "passed" }) }]);
  assert.equal(stripAnsi(checksText(two, TTY, { command: "app selfcheck" })), "✓ Both checks passed in 0.3s.");
  assert.equal(
    stripAnsi(checksText(two, TTY, { command: "app selfcheck", verbose: true })),
    ["✓ Both checks passed in 0.3s.", "", "Passed", "  ✓ Send a plain message  0.3s", "    sent and seen", "  ✓ Edit a sent message"].join("\n"),
    "under --verbose a check shows its time from 0.1s",
  );
  const three = await run([selfcheck[0]!, { ...selfcheck[0]!, id: "b" }, { ...selfcheck[0]!, id: "c" }]);
  assert.equal(three.summary, "All 3 checks passed in 0.9s.");
  const one = await run([selfcheck[0]!, selfcheck[5]!]);
  assert.equal(one.summary, "1 of 2 checks passed, 1 not run, in 0.3s.");
  assert.equal(stripAnsi(checksText(one, TTY, { command: "app selfcheck" })), "✓ 1 of 2 checks passed, 1 not run, in 0.3s.\n  Not run: 1 by hand\n\nNext\n  See every check\n    app selfcheck --verbose");
  assert.match(stripAnsi(checksText(one, TTY, { verbose: true })), /Still to check\n {2}○ Start a new chat\n {4}it reaches another person\n/);
  const byHand = await run([selfcheck[0]!, { id: "share", label: "Share with a colleague", run: () => ({ state: "skipped", detail: "it reaches another person", kind: "by hand", fix: { byHand: "Share a note and ask." } }) }]);
  assert.equal(
    stripAnsi(checksText(byHand, TTY, { command: "app selfcheck" })),
    "✓ 1 of 2 checks passed, 1 not run, in 0.3s.\n\nStill to check\n  ○ Share with a colleague\n    it reaches another person\n    Share a note and ask.",
    "a check left to the person is shown on a pass, once, and nothing is hidden, so there is no --verbose hint",
  );
  assert.equal((await run([selfcheck[1]!])).summary, "The check failed: React with a like, in 1.4s.");
  assert.equal((await run([selfcheck[3]!])).summary, "The check needs a look: Store freshness, in under 0.1s.");
  const single = await run([selfcheck[0]!]);
  assert.equal(single.summary, "The check passed in 0.3s.");
  const none = await run([{ id: "n", label: "N", run: () => ({ state: "skipped", detail: "off" }) }]);
  assert.equal(none.summary, "The check was not run, in under 0.1s.");
  assert.equal(stripAnsi(checksText(none, TTY)), `○ ${none.summary}`, "nothing ran: a not-run mark, and no group line without a kind");
  const nones = await run([{ id: "n", label: "N", run: () => ({ state: "skipped", detail: "off" }) }, { id: "m", label: "M", run: () => ({ state: "skipped", detail: "off" }) }]);
  assert.equal(nones.summary, "None of the 2 checks were run, in under 0.1s.");
  const writes = defineChecks<Ctx>({ command: "app selfcheck", noun: ["write", "writes"], checks: [selfcheck[0]!] });
  const clock = heldClock();
  assert.equal((await writes.run({ take: clock.take }, { timers: clock.timers })).summary, "The write passed in 0.3s.");
});

test("off a terminal the report is in words, and under NO_COLOR it has no escape codes", async () => {
  const report = await run(selfcheck);
  const piped = checksText(report, PIPE, { command: "app selfcheck" });
  assert.ok(!hasAnsi(piped));
  assert.match(piped, /^FAIL 1 of 6 checks failed: React with a like\./);
  assert.match(piped, /^ {2}warn Store freshness$/m);
  assert.match(piped, /^ {2}skip Reply in a channel thread$/m);
  const noColor = checksText(report, terminalStyle({ isTTY: true }, { NO_COLOR: "1" }));
  assert.ok(!hasAnsi(noColor));
  assert.match(noColor, /^✗ 1 of 6/, "a terminal under NO_COLOR keeps its symbols, without colour");
  assert.ok(hasAnsi(checksText(report, TTY)));
});

test("printChecks writes the JSON or the text with one trailing newline, and returns the exit code", async () => {
  const report = await run(selfcheck);
  const out: string[] = [];
  const io = { stdout: { write: (s: string) => out.push(s) }, env: {} };
  assert.equal(printChecks(report, io, { json: true }), 3);
  assert.deepEqual(JSON.parse(out[0]!) as ChecksReport, report);
  assert.equal(printChecks(report, io, { command: "app selfcheck" }), 3);
  assert.ok(out[1]!.startsWith("FAIL 1 of 6") && out[1]!.endsWith("app selfcheck --verbose\n") && !out[1]!.endsWith("\n\n"));
  const passed = await run([selfcheck[0]!]);
  assert.equal(printChecks(passed, io), 0);
  assert.equal(FINDINGS_EXIT_CODE.code, 3);
});

test("a check that throws couldn't run, with what it said; one after a skipped check is not run; progress shows each check and is gone after", async () => {
  const report = await run([
    { id: "boom", label: "Boom", run: () => { throw new Error("no window"); } },
    { id: "odd", label: "Odd", run: () => { throw "plain"; } },
    { id: "later", label: "Later", needs: ["boom"], run: () => ({ state: "passed" }) },
    { id: "off", label: "Off", run: () => ({ state: "skipped", detail: "off" }) },
    { id: "after", label: "After", needs: ["off"], run: () => ({ state: "passed" }) },
  ]);
  assert.deepEqual([report.rows[0]!.state, report.rows[0]!.detail], ["errored", "no window"]);
  assert.deepEqual(report.rows[0]!.fix, { byHand: "Report this error to the tool's maintainers; the check itself broke." });
  assert.equal(report.rows[1]!.detail, "plain");
  assert.equal(report.rows[2]!.detail, "not checked: Boom couldn't run");
  assert.equal(report.rows[4]!.detail, "not checked: Off was not run");
  const written: string[] = [];
  const stream = { isTTY: false, write: (s: string) => written.push(s) };
  let now = 0;
  const fire: (() => void)[] = [];
  const timers: Timers = { now: () => now, setTimeout: (fn) => fire.push(fn), clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {} };
  const slow = defineChecks<null>({ command: "app doctor", checks: [{ id: "slow", label: "Slow", run: () => { now += 2500; fire.shift()!(); return { state: "passed" }; } }] });
  const done = await slow.run(null, { progress: stream, env: {}, timers });
  assert.deepEqual(written, ["Still running: Slow (1 of 1), 2.5s so far\n"], "off a terminal, a slow check gets one plain line");
  assert.equal(done.durationMs, 2500);
  const quiet: string[] = [];
  await slow.run(null, { progress: { write: (s: string) => quiet.push(s) }, off: true });
  assert.deepEqual(quiet, [], "off: no progress, as under --json");
  const real = await defineChecks<null>({ command: "app doctor", checks: [{ id: "r", label: "R", run: () => ({ state: "passed" }) }] }).run(null);
  assert.equal(real.verdict, "passed");
});

test("findings exit with the declared findings code and a check that couldn't run exits 1, never the same code", async () => {
  const found = await run([selfcheck[0]!, selfcheck[1]!]);
  assert.deepEqual([found.verdict, found.exitCode], ["failed", FINDINGS_EXIT_CODE.code]);
  const crashed = await run([selfcheck[0]!, selfcheck[1]!, { id: "boom", label: "Window", run: () => { throw new Error("no window"); } }]);
  assert.deepEqual([crashed.verdict, crashed.exitCode], ["errored", BASE_EXIT_CODES[1]!.code]);
  assert.notEqual(found.exitCode, crashed.exitCode);
  assert.equal(crashed.summary, "1 of 3 checks couldn't run: Window. 1 passed, 1 failed, in 1.7s.");
  assert.equal(
    stripAnsi(checksText(crashed, terminalStyle({}, {}))).split("\n").slice(0, 6).join("\n"),
    "ERROR 1 of 3 checks couldn't run: Window. 1 passed, 1 failed, in 1.7s.\n\nCouldn't run\n  ERROR Window\n    no window\n    Fix: Report this error to the tool's maintainers; the check itself broke.",
  );
  const one = await run([{ id: "boom", label: "Window", run: () => { throw new Error("no window"); } }]);
  assert.equal(one.summary, "The check couldn't run: Window, in under 0.1s.");
  const both = await run([selfcheck[3]!, { id: "boom", label: "Window", run: () => { throw new Error("x"); } }]);
  assert.equal(both.summary, "1 of 2 checks couldn't run: Window. 0 passed, 1 warned, in under 0.1s.");
});
