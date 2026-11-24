import assert from "node:assert/strict";
import { test } from "node:test";
import { ceilingReason, ceilingRatchetProblems, declaredSum } from "./ceiling-ratchet.mjs";

const before = `
// Set 2026-11-18 over main at 0e124635, from a bare app of 190,829 bytes of JavaScript.
export const CEILINGS = {
  "dashboard-page": { js: 86_430 + 1024, css: 10_598 + 512 },
};
`;

const raised = before.replace("86_430", "87_000");
const reworded = before.replace('"dashboard-page"', '"dashboard-page" /* renamed */');

test("declaredSum sums every integer literal in a named const's statement, underscores and all", () => {
  assert.equal(declaredSum(before, "CEILINGS"), 86_430 + 1024 + 10_598 + 512);
});

test("declaredSum returns null when the name is not declared, and ignores numbers in comments above the statement", () => {
  assert.equal(declaredSum(before, "MISSING"), null);
  assert.equal(declaredSum(before, "CEILINGS"), 86_430 + 1024 + 10_598 + 512); // not 190_829 + that
});

test("declaredSum holds across a reword that touches no number", () => {
  assert.equal(declaredSum(reworded, "CEILINGS"), declaredSum(before, "CEILINGS"));
});

test("ceilingRatchetProblems flags an anchor whose sum rose, naming it and the fix", () => {
  const anchors = [{ id: "pattern-size.mjs CEILINGS", base: declaredSum(before, "CEILINGS"), head: declaredSum(raised, "CEILINGS") }];
  const [problem, ...rest] = ceilingRatchetProblems({ anchors, body: "" });
  assert.equal(rest.length, 0);
  assert.match(problem, /^pattern-size\.mjs CEILINGS rose from 98564 to 99134\./);
  assert.match(problem, /Fix: name, in the description,.*"ceiling: <reason>" line\./);
});

test("ceilingRatchetProblems passes an anchor that held, shrank, or whose growth earns a reason", () => {
  const held = [{ id: "a", base: 10, head: 10 }];
  const shrank = [{ id: "a", base: 10, head: 9 }];
  assert.deepEqual(ceilingRatchetProblems({ anchors: held, body: "" }), []);
  assert.deepEqual(ceilingRatchetProblems({ anchors: shrank, body: "" }), []);
  const rose = [{ id: "a", base: 10, head: 11 }];
  assert.deepEqual(ceilingRatchetProblems({ anchors: rose, body: "ceiling: #3481 run 45417475143 earns it\n" }), []);
});

test("ceilingRatchetProblems treats a side absent from base or head as a new constant, not a raise", () => {
  const added = [{ id: "a", base: null, head: 10 }];
  const removed = [{ id: "a", base: 10, head: null }];
  assert.deepEqual(ceilingRatchetProblems({ anchors: added, body: "" }), []);
  assert.deepEqual(ceilingRatchetProblems({ anchors: removed, body: "" }), []);
});

test("ceilingReason reads the reason from any line, case-insensitively, trimmed, and rejects an empty or too-short one", () => {
  assert.equal(ceilingReason("Fixes #12.\n  Ceiling:   #3481 run 45417475143  \r\n"), "#3481 run 45417475143");
  assert.equal(ceilingReason("Mentions ceiling: in prose only, not at a line start"), null);
  assert.equal(ceilingReason("ceiling:\n"), null);
  assert.equal(ceilingReason("ceiling: ab\n"), null);
  assert.equal(ceilingReason(undefined), null);
});
