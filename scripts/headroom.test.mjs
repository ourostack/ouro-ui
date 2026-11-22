import assert from "node:assert/strict";
import { test } from "node:test";
import { exemptionProblems, headroomProblems, readExemptions } from "./headroom.mjs";

const named = (test) => ({ test, reason: "slow", owner: "drain-3" });

test("headroom fails a test over half its timeout, naming the test, its time and its budget", () => {
  const problems = headroomProblems([{ name: "site (chromium) a.test.tsx > A > b", durationMs: 17_000, timeoutMs: 30_000 }], []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /site \(chromium\) a\.test\.tsx > A > b took 17\.0 s against a budget of 30\.0 s/);
});

test("headroom passes a test at or under half its own timeout, whatever the timeout", () => {
  const tests = [
    { name: "a", durationMs: 7_500, timeoutMs: 15_000 },
    { name: "b", durationMs: 30_000, timeoutMs: 60_000 },
  ];
  assert.deepEqual(headroomProblems(tests, []), []);
});

test("headroom lets a named exemption's test run over half", () => {
  assert.deepEqual(headroomProblems([{ name: "a", durationMs: 20_000, timeoutMs: 30_000 }], [named("a")]), []);
});

test("headroom fails an exemption whose test now runs well under its budget, and keeps one that hovers near half", () => {
  const stale = headroomProblems([{ name: "a", durationMs: 5_000, timeoutMs: 30_000 }], [named("a")]);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /remove its exemption/);
  assert.deepEqual(headroomProblems([{ name: "a", durationMs: 13_000, timeoutMs: 30_000 }], [named("a")]), []);
});

test("headroom leaves an exemption alone when its test did not run in this shard", () => {
  assert.deepEqual(headroomProblems([{ name: "b", durationMs: 1_000, timeoutMs: 30_000 }], [named("a")]), []);
});

test("an exemption with no reason or owner fails", () => {
  assert.equal(exemptionProblems([{ test: "a", reason: "", owner: "x" }, { test: "b", reason: "r" }]).length, 2);
});

test("the committed exemptions each name a test, a reason and an owner, once", () => {
  const exemptions = readExemptions();
  assert.deepEqual(exemptionProblems(exemptions), []);
  assert.equal(new Set(exemptions.map((entry) => entry.test)).size, exemptions.length);
});
