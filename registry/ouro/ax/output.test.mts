import { test } from "node:test";
import assert from "node:assert/strict";
import { page, render, truncate } from "./output.ts";

test("one result renders as JSON or as its text, with one trailing newline", () => {
  assert.equal(render({ a: 1 }, { json: true, text: () => "x" }), '{\n  "a": 1\n}\n');
  assert.equal(render({ a: 1 }, { json: false, text: (r) => `a is ${r.a}` }), "a is 1\n");
  assert.equal(render([1], { json: false }), "[\n  1\n]\n");
});

test("truncate cuts at a line break and says how much it showed and how to get the rest", () => {
  const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join("\n");
  const t = truncate(text, 200);
  assert.ok(t.truncated && t.text.length <= 200, String(t.text.length));
  assert.match(t.text, /\n\[truncated: 200 of \d+ characters shown; ask for less, such as a smaller limit\]$/);
  assert.match(t.text.split("\n").at(-2)!, /^line \d+$/);
  assert.deepEqual(truncate("short", 10), { text: "short", truncated: false, total: 5 });
  assert.ok(truncate("x".repeat(500), 100).text.startsWith("x".repeat(20)));
});

test("page walks a list with a cursor and refuses a cursor it did not give", () => {
  const first = page([1, 2, 3, 4, 5], { limit: 2 });
  assert.deepEqual(first, { items: [1, 2], total: 5, nextCursor: "2" });
  const last = page([1, 2, 3, 4, 5], { limit: 4, cursor: first.nextCursor });
  assert.deepEqual(last, { items: [3, 4, 5], total: 5, nextCursor: null });
  assert.throws(() => page([1], { limit: 1, cursor: "9" }), /Fix: start again without a cursor/);
});
