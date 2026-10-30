import { test } from "node:test";
import assert from "node:assert/strict";
import { audience, effectAnnotations, namesLine, privateResult } from "./effects.ts";

test("an others action previews who will see it and its result says who can", () => {
  const a = audience({ doing: "Sending", done: "Sent", where: '"Design sync"', as: "the person", who: "everyone" });
  assert.equal(a.preview, 'Sending to "Design sync" as the person. Everyone in "Design sync" will see it.');
  assert.equal(a.result, 'Sent to "Design sync" as the person. Everyone in "Design sync" can see it.');
  assert.equal(audience({ doing: "Sending", done: "Sent", where: "Sam Lee", as: "the person", who: ["Sam Lee"] }).result, "Sent to Sam Lee as the person. Sam Lee can see it.");
});

test("names read as a person would say them", () => {
  assert.equal(namesLine([]), "nobody");
  assert.equal(namesLine(["A", "B"]), "A and B");
  assert.equal(namesLine(["A", "B", "C"]), "A, B and 1 other");
  assert.equal(namesLine(["A", "B", "C", "D"], 3), "A, B, C and 1 other");
  assert.equal(namesLine(["A", "B", "C", "D"]), "A, B and 2 others");
});

test("a private result says nothing was sent; annotations follow the effect", () => {
  assert.equal(privateResult("Draft saved."), "Draft saved. Only you see it; nothing was sent.");
  assert.deepEqual(effectAnnotations("others", false), { readOnlyHint: false, destructiveHint: true, openWorldHint: true });
  assert.deepEqual(effectAnnotations("private", true), { readOnlyHint: true, destructiveHint: false, openWorldHint: false });
});
