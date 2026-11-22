import assert from "node:assert/strict";
import { test } from "node:test";
import { exemptionProblems, headroomProblems, readExemptions, staleExemptions } from "./headroom.mjs";

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

test("headroom reads * in an exemption as any text, so one entry covers a test in every project and size", () => {
  const entry = [named("* a.test.tsx > at * px > b")];
  assert.deepEqual(headroomProblems([{ name: "p (webkit) a.test.tsx > at 390 px > b", durationMs: 20_000, timeoutMs: 30_000 }], entry), []);
  assert.equal(headroomProblems([{ name: "p (webkit) a.test.tsx > at 390 px > c", durationMs: 20_000, timeoutMs: 30_000 }], entry).length, 1);
});

test("headroom fails an exemption whose test file or title is gone, and keeps a present one", () => {
  const stale = staleExemptions([{ test: `p (c) scripts/headroom.test.mjs > a > ${["absent", "title", "text"].join(" ")}`, reason: "r", owner: "o" }]);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /remove its exemption/);
  assert.equal(staleExemptions([{ test: "p (c) scripts/missing.test.mjs > a > b", reason: "r", owner: "o" }]).length, 1);
  assert.deepEqual(staleExemptions([{ test: "p (c) scripts/headroom.test.mjs > a > headroom fails a test over half", reason: "r", owner: "o" }]), []);
});

test("every committed exemption still names a test in the source", () => {
  assert.deepEqual(staleExemptions(readExemptions()), []);
});

test("an exemption with no reason or owner fails", () => {
  assert.equal(exemptionProblems([{ test: "a", reason: "", owner: "x" }, { test: "b", reason: "r" }]).length, 2);
});

test("the committed exemptions each name a test, a reason and an owner, once", () => {
  const exemptions = readExemptions();
  assert.deepEqual(exemptionProblems(exemptions), []);
  assert.equal(new Set(exemptions.map((entry) => entry.test)).size, exemptions.length);
});
