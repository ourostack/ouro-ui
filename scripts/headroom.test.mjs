import assert from "node:assert/strict";
import { test } from "node:test";
import { changedFiles, exemptionProblems, judge, headroomProblems, headroomReason, ratchetProblems, readExemptions, staleExemptions } from "./headroom.mjs";

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

test("the exemption count only goes down: a larger file fails unless the description gives a reason", () => {
  const base = [named("a"), named("b")];
  const grown = [...base, named("c")];
  assert.deepEqual(ratchetProblems({ base, head: base, body: "" }), []);
  assert.deepEqual(ratchetProblems({ base, head: [named("a")], body: "" }), []);
  const failed = ratchetProblems({ base, head: grown, body: "Adds c." });
  assert.equal(failed.length, 1);
  assert.match(failed[0], /from 2 to 3 exemptions/);
  assert.deepEqual(ratchetProblems({ base, head: grown, body: "headroom: c's cost is the page load, fixed in the next change" }), []);
  assert.equal(ratchetProblems({ base, head: grown, body: "headroom: slow" }).length, 1);
});

test("headroomReason reads the line, not a mention", () => {
  assert.equal(headroomReason("text headroom: long enough reason"), null);
  assert.equal(headroomReason("a\nHeadroom: long enough reason\nb"), "long enough reason");
});

test("a breach on a push to main annotates and stays green; a pull request fails it only in a changed file", () => {
  const tests = [{ name: "site (chromium) a.test.tsx > slow", file: "a.test.tsx", durationMs: 17_000, timeoutMs: 30_000 }];
  const push = judge({ tests, exemptions: [], event: "push", changed: null });
  assert.deepEqual(push.failures, []);
  assert.equal(push.breaches.length, 1);
  assert.match(push.warnings[0], /^::warning title=Headroom::\[ouro-ui\] Headroom: site \(chromium\) a\.test\.tsx > slow took 17\.0 s against a budget of 30\.0 s/);
  for (const event of ["merge_group", "schedule"]) assert.deepEqual(judge({ tests, exemptions: [], event, changed: null }).failures, []);
  const pull = judge({ tests, exemptions: [], event: "pull_request", changed: new Set(["a.test.tsx"]) });
  assert.equal(pull.failures.length, 1);
  assert.deepEqual(pull.warnings, []);
  assert.deepEqual(judge({ tests, exemptions: [], event: "pull_request", changed: new Set(["b.test.tsx"]) }).failures, []);
  assert.equal(judge({ tests, exemptions: [], event: undefined, changed: null }).failures.length, 1);
});

test("a malformed exemption fails the run on main too", () => {
  assert.equal(judge({ tests: [], exemptions: [{ test: "x", reason: "", owner: "o" }], event: "push", changed: null }).failures.length >= 1, true);
});

test("changedFiles reads a pull request's files, and judges every test where it gets none", () => {
  assert.deepEqual([...changedFiles("a.test.tsx\n b/c.test.ts \n\n")], ["a.test.tsx", "b/c.test.ts"]);
  assert.equal(changedFiles(undefined), null);
  assert.equal(changedFiles(" \n"), null);
});
