import { test } from "node:test";
import assert from "node:assert/strict";
import { outcome } from "./outcome.ts";
import { checkVoice, checkVoiceLine, createVoice, isCi, VOICE_MAX, voiceLines, voiceOn } from "./voice.ts";

const on = { tty: true, json: false, quiet: false, env: {} };

test("a line is one line of plain ASCII, at most 72 characters; the definition is checked when the tool is built", () => {
  assert.equal(VOICE_MAX, 72);
  assert.equal(checkVoiceLine("Pedals down, coasting now."), null);
  assert.equal(checkVoiceLine("x".repeat(72)), null);
  assert.equal(checkVoiceLine("x".repeat(73)), "is 73 characters; the most is 72");
  assert.equal(checkVoiceLine("  "), "is empty");
  assert.equal(checkVoiceLine("one\ntwo"), "is more than one line");
  assert.equal(checkVoiceLine("All done \u2014 nice"), "is not plain ASCII (no emoji, curly quotes or tabs)");
  assert.equal(checkVoiceLine("tab\there"), "is not plain ASCII (no emoji, curly quotes or tabs)");
  assert.doesNotThrow(() => checkVoice("t", { banner: ["Hi."], summary: ["That is the day."], empty: ["Quiet."], done: () => ["x".repeat(100)] }));
  assert.doesNotThrow(() => checkVoice("t", {}));
  assert.throws(() => checkVoice("t", { summary: ["x".repeat(80)] }), /^Error: t: the voice's summary line "x{80}" is 80 characters; the most is 72\. Fix: one line of plain ASCII, at most 72 characters\.$/);
  assert.deepEqual(voiceLines({ banner: ["a"], done: () => ["b"], summary: ["c"], empty: ["d"] }), ["a", "c", "d"]);
  assert.deepEqual(voiceLines({}), []);
});

test("voiceOn: only a terminal, without --json, --quiet or CI", () => {
  assert.equal(voiceOn(on), true);
  assert.equal(voiceOn({ ...on, tty: false }), false);
  assert.equal(voiceOn({ ...on, json: true }), false);
  assert.equal(voiceOn({ ...on, quiet: true }), false);
  for (const ci of ["true", "1", "yes", "GitHub"]) assert.equal(isCi({ CI: ci }), true, ci);
  for (const ci of [undefined, "", "0", "false", " FALSE "]) assert.equal(isCi(ci === undefined ? {} : { CI: ci }), false, String(ci));
  assert.equal(voiceOn({ ...on, env: { CI: "true" } }), false);
});

test("variants rotate, never the same line twice in a row, and a process celebrates once", () => {
  const voice = createVoice({ banner: ["A.", "B.", "C."], empty: [] }, { ...on, start: 4 });
  assert.equal(voice.on, true);
  assert.deepEqual([voice.line("banner"), voice.line("banner"), voice.line("banner"), voice.line("banner")], ["B.", "C.", "A.", "B."]);
  assert.equal(voice.line("empty"), null);
  assert.equal(voice.line("summary"), null);
  const done = createVoice({ done: (o) => (o.action === "quiet" ? [] : ["\u{1F6B2} bad", "Rolled in."]) }, { ...on, start: 0 });
  assert.equal(done.line("done"), null, "no outcome, no celebration");
  assert.equal(done.line("done", outcome({ action: "quiet", state: "done", summary: "Q." })), null);
  assert.equal(done.line("done", outcome({ action: "send", state: "done", summary: "S." })), "Rolled in.", "a line that breaks the rules is never printed");
  assert.equal(done.line("done", outcome({ action: "send", state: "done", summary: "S." })), null, "one celebration per process");
  assert.equal(createVoice({}, { ...on, start: 0 }).line("done", outcome({ action: "x", state: "done", summary: "X." })), null);
  const off = createVoice({ banner: ["A."] }, { ...on, quiet: true });
  assert.equal(off.on, false);
  assert.equal(off.line("banner"), null);
  const clock = createVoice({ banner: ["A.", "B."] }, on).line("banner");
  assert.ok(clock === "A." || clock === "B.");
});
