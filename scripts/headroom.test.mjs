import assert from "node:assert/strict";
import { test } from "node:test";
import { changedFiles, exemptionProblems, expiredExemptions, expiredWarning, isExpired, judge, headroomProblems, headroomReason, ratchetProblems, readExemptions, staleExemptions, unsuffixedProjectExemptions } from "./headroom.mjs";

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

test("headroom stops letting an expired exemption's test run over half: the breach shows again", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const expired = [{ ...named("a"), expiry: "2026-05-01T00:00:00Z" }];
  const problems = headroomProblems([{ name: "a", durationMs: 20_000, timeoutMs: 30_000 }], expired, now);
  assert.equal(problems.filter((problem) => /took 20\.0 s/.test(problem)).length, 1);
  assert.deepEqual(headroomProblems([{ name: "a", durationMs: 20_000, timeoutMs: 30_000 }], [{ ...named("a"), expiry: "2027-01-01T00:00:00Z" }], now), []);
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

test("an exemption's explicit project name carries Vitest's own (browser) suffix, so it matches a real test", () => {
  assert.deepEqual(unsuffixedProjectExemptions([{ test: "* a.test.tsx > b" }]), []);
  assert.deepEqual(unsuffixedProjectExemptions([{ test: "site (chromium) a.test.tsx > b" }]), []);
  const broken = unsuffixedProjectExemptions([{ test: "site a.test.tsx > b" }]);
  assert.equal(broken.length, 1);
  assert.match(broken[0], /never reports as is for a browser project/);
});

test("every committed exemption's project name carries Vitest's own (browser) suffix", () => {
  assert.deepEqual(unsuffixedProjectExemptions(readExemptions()), []);
});

test("an exemption with no reason or owner fails", () => {
  assert.equal(exemptionProblems([{ test: "a", reason: "", owner: "x" }, { test: "b", reason: "r" }]).length, 2);
});

test("an exemption's issue must be a GitHub issue URL, and its expiry an ISO date-time, when given", () => {
  assert.deepEqual(exemptionProblems([{ test: "a", reason: "r", owner: "o" }]), []);
  assert.deepEqual(exemptionProblems([{ test: "a", reason: "r", owner: "o", issue: "https://github.com/ourostack/ouro-ui/issues/3032", expiry: "2099-01-01T00:00:00Z" }]), []);
  const badIssue = exemptionProblems([{ test: "a", reason: "r", owner: "o", issue: "not a url" }]);
  assert.equal(badIssue.length, 1);
  assert.match(badIssue[0], /issue that is not a GitHub issue URL/);
  const badExpiry = exemptionProblems([{ test: "a", reason: "r", owner: "o", expiry: "not a date" }]);
  assert.equal(badExpiry.length, 1);
  assert.match(badExpiry[0], /expiry that is not an ISO 8601 date-time/);
});

test("isExpired reads an exemption's expiry against now, and a missing expiry never expires", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  assert.equal(isExpired({ expiry: "2026-05-31T00:00:00Z" }, now), true);
  assert.equal(isExpired({ expiry: "2026-06-01T00:00:00Z" }, now), true);
  assert.equal(isExpired({ expiry: "2026-06-02T00:00:00Z" }, now), false);
  assert.equal(isExpired({}, now), false);
  assert.equal(isExpired({ expiry: "not a date" }, now), false);
});

test("expiredExemptions names each exemption whose expiry has passed, and keeps an unexpired or expiry-less one quiet", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const exemptions = [{ ...named("a"), expiry: "2026-05-01T00:00:00Z" }, { ...named("b"), expiry: "2027-01-01T00:00:00Z" }, named("c")];
  const problems = expiredExemptions(exemptions, now);
  assert.equal(problems.length, 1);
  assert.equal(problems[0], expiredWarning(exemptions[0]));
  assert.match(problems[0], /a in \.github\/headroom\.json has an expiry \(2026-05-01T00:00:00Z\) that has passed/);
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

test("an exemption with an unsuffixed project name fails the run on main too", () => {
  const exemptions = [{ test: "site scripts/headroom.test.mjs > headroom fails a test over half", reason: "r", owner: "o" }];
  assert.equal(judge({ tests: [], exemptions, event: "push", changed: null }).failures.length, 1);
});

test("an exemption whose expiry has passed fails the run everywhere, even report-only", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  const tests = [{ name: "site (chromium) a.test.tsx > slow", file: "a.test.tsx", durationMs: 17_000, timeoutMs: 30_000 }];
  const expired = [{ ...named("site (chromium) a.test.tsx > slow"), expiry: "2026-05-01T00:00:00Z" }];
  const push = judge({ tests, exemptions: expired, event: "push", changed: null, now });
  assert.equal(push.failures.some((failure) => /has an expiry \(2026-05-01T00:00:00Z\) that has passed/.test(failure)), true);
  const pull = judge({ tests, exemptions: expired, event: "pull_request", changed: new Set(["a.test.tsx"]), now });
  assert.equal(pull.failures.some((failure) => /has an expiry \(2026-05-01T00:00:00Z\) that has passed/.test(failure)), true);
});

test("changedFiles reads a pull request's files, and judges every test where it gets none", () => {
  assert.deepEqual([...changedFiles("a.test.tsx\n b/c.test.ts \n\n")], ["a.test.tsx", "b/c.test.ts"]);
  assert.equal(changedFiles(undefined), null);
  assert.equal(changedFiles(" \n"), null);
});
