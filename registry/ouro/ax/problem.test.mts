import { test } from "node:test";
import assert from "node:assert/strict";
import { AxError, commandLine, didYouMean, errorJson, errorLine, errorMessage } from "./problem.ts";

const shape = { code: "needs-why", exit: 2, thing: "send", problem: "needs --why.", fix: 'tool send abc "hi" --why "<who asked>"' };

test("the line is <tool>: <thing>: <problem>. Fix: <exact code>.", () => {
  assert.equal(errorLine("tool", shape), 'tool: send: needs --why. Fix: tool send abc "hi" --why "<who asked>".');
  assert.equal(errorMessage({ thing: "x", problem: "gone", fix: null }), "x: gone.");
  assert.equal(errorLine("t", { thing: "x", problem: "a\nb", fix: null }), "t: x: a b.");
});

test("AxError carries the shape, its exit and the same message; errorJson adds the message", () => {
  const e = new AxError(shape);
  assert.equal(e.exit, 2);
  assert.equal(e.message, errorMessage(shape));
  assert.deepEqual(errorJson(shape).error, { ...shape, message: e.message });
});

test("didYouMean: the nearest within a couple of edits, else a unique prefix, else null", () => {
  assert.equal(didYouMean("lim", ["limit", "ids"]), "limit");
  assert.equal(didYouMean("limt", ["limit", "ids"]), "limit");
  assert.equal(didYouMean("whyy", ["why", "agent"]), "why");
  assert.equal(didYouMean("zzzzzz", ["limit", "ids"]), null);
  assert.equal(didYouMean("", ["a"]), null);
});

test("didYouMean: a closer name wins over a longer unique prefix", () => {
  assert.equal(didYouMean("n", ["names", "in", "limit"]), "in");
});

test("didYouMean: a one-letter omission suggests a name one edit away", () => {
  const names = ["conversations", "names", "limit", "in", "selfcheck"];
  const oneEditApart = (a: string, b: string) => [...b].some((_, i) => b.slice(0, i) + b.slice(i + 1) === a);
  let cases = 0;
  for (const name of names) for (let i = 0; i < name.length; i++) {
    const typo = name.slice(0, i) + name.slice(i + 1);
    if (!typo || names.includes(typo)) continue;
    const suggestion = didYouMean(typo, names);
    assert.ok(suggestion && oneEditApart(typo, suggestion), `${typo}: ${suggestion}`);
    cases++;
  }
  assert.ok(cases > 0);
});

test("commandLine quotes only what a shell would split or expand", () => {
  assert.equal(commandLine(["t", "look", "abc123#17", "--ids", "1,2", "<conversation>", "two words", 'say "hi" $x']), 't look abc123#17 --ids 1,2 <conversation> "two words" "say \\"hi\\" \\$x"');
});
