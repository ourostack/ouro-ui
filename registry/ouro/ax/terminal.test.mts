import { test } from "node:test";
import assert from "node:assert/strict";
import { createProgress, FRAMES, hasAnsi, markOf, MARKS, nextStepsText, paint, stripAnsi, terminalStyle, timeText, type Timers } from "./terminal.ts";

const TTY = { isTTY: true };
const PIPE = {};
const style = (stream: { isTTY?: boolean }, env: Record<string, string> = {}) => terminalStyle(stream, env);

test("colour only on a terminal: NO_COLOR always wins, FORCE_COLOR turns it on for a capture, TERM=dumb is no terminal", () => {
  assert.deepEqual(style(TTY), { tty: true, color: true, symbols: true });
  assert.deepEqual(style(PIPE), { tty: false, color: false, symbols: false });
  assert.deepEqual(style(TTY, { NO_COLOR: "1" }), { tty: true, color: false, symbols: true });
  assert.deepEqual(style(TTY, { NO_COLOR: "" }), { tty: true, color: true, symbols: true });
  assert.deepEqual(style(PIPE, { FORCE_COLOR: "1" }), { tty: false, color: true, symbols: true });
  assert.deepEqual(style(PIPE, { CLICOLOR_FORCE: "1" }), { tty: false, color: true, symbols: true });
  assert.deepEqual(style(PIPE, { FORCE_COLOR: "0" }), { tty: false, color: false, symbols: false });
  assert.deepEqual(style(PIPE, { FORCE_COLOR: "false", CLICOLOR_FORCE: "" }), { tty: false, color: false, symbols: false });
  assert.deepEqual(style(PIPE, { FORCE_COLOR: "1", NO_COLOR: "1" }), { tty: false, color: false, symbols: true });
  assert.deepEqual(style(TTY, { TERM: "dumb" }), { tty: false, color: false, symbols: false });
});

test("paint wraps text in escape codes only with colour, and stripAnsi takes them out", () => {
  const on = paint({ color: true });
  const off = paint({ color: false });
  assert.equal(on.red("x"), "\x1b[31mx\x1b[0m");
  assert.equal(on.bold(""), "");
  assert.equal(off.red("x"), "x");
  for (const name of ["bold", "dim", "red", "green", "yellow", "cyan"] as const) {
    assert.ok(hasAnsi(on[name]("x")), name);
    assert.equal(stripAnsi(on[name]("x")), "x");
    assert.ok(!hasAnsi(off[name]("x")), name);
  }
  assert.equal(stripAnsi("a\x1b[2Kb\x1b]8;;https://example.invalid\x07c"), "abc");
});

test("a mark is a coloured symbol on a terminal and a word elsewhere", () => {
  assert.equal(markOf("passed", style(TTY)), "\x1b[32m✓\x1b[0m");
  assert.equal(markOf("failed", style(TTY, { NO_COLOR: "1" })), "✗");
  assert.deepEqual(
    (Object.keys(MARKS) as (keyof typeof MARKS)[]).map((m) => markOf(m, style(PIPE))),
    ["ok", "FAIL", "warn", "skip", "plan"],
  );
});

test("timeText gives tenths of a second under a minute, then minutes and seconds", () => {
  assert.equal(timeText(0), "0.0s");
  assert.equal(timeText(-5), "0.0s");
  assert.equal(timeText(420), "0.4s");
  assert.equal(timeText(14_249), "14.2s");
  assert.equal(timeText(59_940), "59.9s");
  assert.equal(timeText(59_960), "1m 00s");
  assert.equal(timeText(65_000), "1m 05s");
  assert.equal(timeText(3_725_000), "62m 05s");
});

test("next steps put each command alone on its line, under its reason", () => {
  assert.equal(nextStepsText([], style(TTY)), "");
  assert.equal(
    nextStepsText([{ command: "tool sync", why: "Read the latest" }, { command: "tool doctor --verbose", why: "See every check" }], style(PIPE)),
    "Next\n  Read the latest\n    tool sync\n  See every check\n    tool doctor --verbose",
  );
  assert.equal(nextStepsText([{ command: "tool sync", why: "Read the latest" }], style(TTY)), "\x1b[1mNext\x1b[0m\n  Read the latest\n    \x1b[36mtool sync\x1b[0m");
});

/** A held clock: time moves only when the test says, and due timers fire in order. */
function heldTimers() {
  let now = 1000;
  let seq = 0;
  const due = new Map<number, { at: number; fn: () => void; every?: number }>();
  const timers: Timers = {
    now: () => now,
    setTimeout: (fn, ms) => (due.set(++seq, { at: now + ms, fn }), seq),
    clearTimeout: (h) => void due.delete(h as number),
    setInterval: (fn, ms) => (due.set(++seq, { at: now + ms, fn, every: ms }), seq),
    clearInterval: (h) => void due.delete(h as number),
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at += t.every;
      else due.delete(id);
      t.fn();
    }
    now = end;
  };
  return { timers, advance, pending: () => due.size };
}

const sink = (isTTY?: boolean) => {
  const out: string[] = [];
  return { stream: { ...(isTTY === undefined ? {} : { isTTY }), write: (s: string) => out.push(s) }, out, text: () => out.join("") };
};

test("on a terminal, the spinner draws after the delay, redraws in place, and is wiped on stop", () => {
  const { timers, advance, pending } = heldTimers();
  const s = sink(true);
  const p = createProgress(s.stream, { env: {}, timers });
  p.start("Send a picture", { index: 4, total: 12 });
  advance(100);
  assert.equal(s.text(), "", "nothing before the delay, so a fast step never flickers");
  advance(60);
  assert.equal(s.out.at(-1), `\r${FRAMES[0]} Send a picture  4 of 12 · 0.2s`);
  advance(3000);
  assert.match(s.out.at(-1)!, /^\r. Send a picture {2}4 of 12 · 3\.1s$/, "the last frame, 3.12s in");
  assert.ok(!hasAnsi(s.text()), "the spinner redraws with a carriage return, not escape codes");
  const width = s.out.at(-1)!.length - 1;
  p.start("Edit");
  assert.equal(s.out.at(-1), `\r${" ".repeat(width)}\r`, "a new step wipes the last line");
  advance(200);
  assert.equal(s.out.at(-1), `\r${FRAMES[0]} Edit  0.2s`, "the next step draws on the wiped line");
  p.stop();
  assert.match(s.out.at(-1)!, /^\r +\r$/);
  assert.equal(pending(), 0);
  p.stop();
  const fast = sink(true);
  const q = createProgress(fast.stream, { env: {}, timers });
  q.start("Quick");
  advance(10);
  q.stop();
  assert.equal(fast.text(), "", "a step done before the delay draws nothing at all");
});

test("off a terminal, progress is one plain line for a step still running after the slow mark, and no escape codes", () => {
  const { timers, advance } = heldTimers();
  for (const [stream, env] of [[sink(false), {}], [sink(true), { CI: "true" }], [sink(true), { TERM: "dumb" }]] as const) {
    const p = createProgress(stream.stream, { env, timers, slowMs: 2000 });
    p.start("Send a picture", { index: 4, total: 12 });
    advance(1999);
    assert.equal(stream.text(), "");
    advance(5000);
    assert.equal(stream.text(), "Still running: Send a picture (4 of 12), 2.0s so far\n");
    p.stop();
    p.start("Edit");
    advance(1000);
    p.stop();
    advance(5000);
    assert.equal(stream.text(), "Still running: Send a picture (4 of 12), 2.0s so far\n", "a step that ends in time prints nothing");
    p.start("Delete");
    advance(2500);
    assert.equal(stream.out.at(-1), "Still running: Delete, 2.0s so far\n");
    p.stop();
  }
});

test("progress that is off prints nothing, as under --json or --quiet", () => {
  const { timers, advance } = heldTimers();
  const s = sink(true);
  const p = createProgress(s.stream, { env: {}, timers, off: true });
  p.start("Send");
  advance(10_000);
  p.stop();
  assert.equal(s.text(), "");
});

test("progress runs on the real clock when given no timers", async () => {
  const s = sink(true);
  const p = createProgress(s.stream, { env: {}, delayMs: 1, frameMs: 1 });
  p.start("Real");
  await new Promise((r) => setTimeout(r, 30));
  p.start("Again");
  p.stop();
  assert.match(s.text(), /Real/);
});
