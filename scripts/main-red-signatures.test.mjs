import assert from "node:assert/strict";
import { test } from "node:test";
import { activeEntries, alreadyLogged, candidateComment, candidateMarker, entryProblems, jobVerdict, passable, report } from "./main-red-signatures.mjs";

const hour = 60 * 60 * 1000;
const filedAt = "2026-01-01T00:00:00.000Z";
const within = new Date(Date.parse(filedAt) + hour).toISOString();
const over = new Date(Date.parse(filedAt) + 25 * hour).toISOString();
// A fixed instant inside every fixture entry's filed/expires window, so a test never depends on the real clock.
const withinNow = new Date(Date.parse(filedAt) + 30 * 60 * 1000);

const entry = (overrides = {}) => ({
  project: "ouro-chromium",
  file: "registry/ouro/components/ouro/card/card.test.tsx",
  title: "Card > renders",
  job: "browser (4/22)",
  issue: "https://github.com/o/r/issues/1",
  owner: "arimendelow",
  filed: filedAt,
  expires: within,
  ...overrides,
});

test("entryProblems needs every field, a real issue URL, and a filed/expires window of at most 24h", () => {
  assert.deepEqual(entryProblems([entry()]), []);
  const missing = entryProblems([{}]);
  assert.ok(missing.some((problem) => problem.includes("has no project")));
  assert.ok(missing.some((problem) => problem.includes("has no job")));
  assert.ok(missing.some((problem) => problem.includes("has no issue URL")));
  assert.ok(missing.some((problem) => problem.includes("has no filed date")));
  assert.ok(missing.some((problem) => problem.includes("has no expires date")));
  assert.ok(entryProblems([entry({ issue: "not a url" })])[0].includes("has no issue URL"));
  assert.ok(entryProblems([entry({ expires: filedAt })])[0].includes("expires before it is filed"));
  assert.ok(entryProblems([entry({ filed: "2026-01-02T00:00:00.000Z", expires: filedAt })])[0].includes("expires before it is filed"));
  assert.ok(entryProblems([entry({ expires: over })])[0].includes("files a window over 24h"));
  assert.deepEqual(entryProblems("not an array"), ["the signatures must be a JSON array of entries"]);
});

test("activeEntries keeps only an entry whose expires is still ahead of now, dropping an expired one", () => {
  const now = new Date(Date.parse(filedAt) + 2 * hour);
  assert.deepEqual(activeEntries([entry({ expires: within })], now), []);
  const active = entry({ expires: new Date(Date.parse(filedAt) + 3 * hour).toISOString() });
  assert.deepEqual(activeEntries([active], now), [active]);
});

const log = (lines) => lines.join("\n");
const failLine = "FAIL  ouro-chromium (chromium) registry/ouro/components/ouro/card/card.test.tsx > Card > renders";

test("jobVerdict covers a job only when an active signature for that exact job names every failing test, the count matches, and nothing is unexplained", () => {
  const covered = jobVerdict({ job: "browser (4/22)", log: log([failLine, "Tests  1 failed"]), entries: [entry()], now: withinNow });
  assert.deepEqual(covered, { covered: true, reasons: [], tests: [{ project: "ouro-chromium", file: "registry/ouro/components/ouro/card/card.test.tsx", title: "Card > renders" }] });

  const noEntry = jobVerdict({ job: "browser (4/22)", log: log([failLine, "Tests  1 failed"]), entries: [], now: withinNow });
  assert.equal(noEntry.covered, false);
  assert.ok(noEntry.reasons[0].includes("is not covered by an active signature"));

  const wrongJob = jobVerdict({ job: "browser (5/22)", log: log([failLine, "Tests  1 failed"]), entries: [entry()], now: withinNow });
  assert.equal(wrongJob.covered, false);

  const expired = jobVerdict({ job: "browser (4/22)", log: log([failLine, "Tests  1 failed"]), entries: [entry()], now: new Date(Date.parse(within) + hour) });
  assert.equal(expired.covered, false);

  const unexplained = jobVerdict({ job: "browser (4/22)", log: log([failLine, "Tests  1 failed", "FAIL registry/ouro/components/ouro/card/card-styles.ts [Error: boom]"]), entries: [entry()], now: withinNow });
  assert.equal(unexplained.covered, false);
  assert.ok(unexplained.reasons.some((reason) => reason.includes("failed beyond a test")));

  const mismatch = jobVerdict({ job: "browser (4/22)", log: log([failLine, "Tests  2 failed"]), entries: [entry()], now: withinNow });
  assert.equal(mismatch.covered, false);
  assert.ok(mismatch.reasons.some((reason) => reason.includes("reports 2 failed tests but names 1")));

  const nothing = jobVerdict({ job: "browser (4/22)", log: "all green", entries: [entry()], now: withinNow });
  assert.equal(nothing.covered, false);
  assert.ok(nothing.reasons.some((reason) => reason.includes("no test failure found")));
});

test("passable fails closed on an empty or missing failing-job set, and is true only when every job is covered", () => {
  assert.deepEqual(passable({ jobs: [], entries: [entry()] }), { passable: false, verdicts: [], reason: "no failing job could be read; failing closed" });
  assert.deepEqual(passable({ jobs: undefined, entries: [entry()] }), { passable: false, verdicts: [], reason: "no failing job could be read; failing closed" });

  const covered = passable({ jobs: [{ name: "browser (4/22)", log: log([failLine, "Tests  1 failed"]) }], entries: [entry()], now: withinNow });
  assert.equal(covered.passable, true);
  assert.equal(covered.verdicts.length, 1);

  const twoJobs = passable({
    jobs: [{ name: "browser (4/22)", log: log([failLine, "Tests  1 failed"]) }, { name: "browser (9/22)", log: "boom, no test ran" }],
    entries: [entry()],
    now: withinNow,
  });
  assert.equal(twoJobs.passable, false);
  assert.equal(twoJobs.verdicts.length, 2);
});

test("candidateMarker and alreadyLogged dedupe one verdict comment per sha, as rerun-guard dedupes per run and attempt", () => {
  const comment = candidateComment({ state: { sha: "abc1234def", url: "https://x/run/9" }, result: { passable: true, verdicts: [] } });
  assert.match(comment, new RegExp(candidateMarker("abc1234def").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(comment.includes("would pass"));
  assert.ok(alreadyLogged([comment], "abc1234def"));
  assert.ok(!alreadyLogged([comment], "def5678abc"));
});

test("candidateComment names each job's coverage and a failing-closed reason, and always says it changes nothing that merges", () => {
  const blocked = candidateComment({ state: { sha: "deadbee", url: "https://x/run/1" }, result: { passable: false, verdicts: [], reason: "no failing job could be read; failing closed" } });
  assert.ok(blocked.includes("would still block"));
  assert.ok(blocked.includes("no failing job could be read; failing closed"));
  assert.ok(blocked.includes("changes nothing that merges"));
  const named = candidateComment({ state: { sha: "deadbee", url: "https://x/run/1" }, result: { passable: false, verdicts: [{ job: "browser (4/22)", covered: false, reasons: ["browser (4/22): not covered"] }] } });
  assert.ok(named.includes("browser (4/22): not covered (browser (4/22): not covered)"));
});

/** An in-process stand-in for main-green.mjs's ghApi: the CI runs and the run's jobs. */
function fakeApi({ runs, jobs = [] } = {}) {
  return (path) => {
    if (path.includes("/ci.yml/runs")) return { workflow_runs: runs };
    if (path.includes("/jobs")) return { jobs };
    throw new Error(`no route for ${path}`);
  };
}

test("report passes without reading or posting anything while main is green", async () => {
  const logged = [];
  const result = await report({ env: { GITHUB_REPOSITORY: "o/r" }, api: fakeApi({ runs: [{ id: 1, head_sha: "s1", status: "completed", conclusion: "success", html_url: "https://x/1" }] }), log: (line) => logged.push(line) });
  assert.deepEqual(result, { posted: false });
  assert.ok(logged.some((line) => line.includes("main is green")));
});

test("report reads main's failing jobs, logs the candidate verdict on #3797 once per sha, and skips a second report of the same sha", async () => {
  const run = { id: 9, head_sha: "deadbee", status: "completed", conclusion: "failure", html_url: "https://x/9" };
  const api = fakeApi({ runs: [run], jobs: [{ id: 1, name: "browser (4/22)", conclusion: "failure" }, { id: 2, name: "browser (5/22)", conclusion: "success" }] });
  const posts = [];
  const common = {
    env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" },
    api,
    jobLog: () => log([failLine, "Tests  1 failed"]),
    readIssueComments: async () => posts.map((post) => post.body),
    writeIssueComment: async (args) => posts.push(args),
    log() {},
  };
  const first = await report({ ...common, now: new Date(Date.parse(filedAt) + hour) });
  assert.equal(first.posted, true, "nothing is logged yet for this sha, so it posts once");
  assert.equal(first.result.passable, false, "no filed entry covers it at this instant, so nothing would pass");
  assert.equal(posts.length, 1);
  assert.ok(posts[0].body.includes("would still block"));
  const second = await report({ ...common });
  assert.equal(second.posted, false);
  assert.equal(posts.length, 1, "the same sha is logged only once");
});

test("report fails open and never throws when main's runs or the issue cannot be read", async () => {
  const brokenRuns = await report({ env: { GITHUB_REPOSITORY: "o/r" }, api: () => { throw new Error("HTTP 500"); }, log() {} });
  assert.deepEqual(brokenRuns, { posted: false });
  const run = { id: 9, head_sha: "deadbee", status: "completed", conclusion: "failure", html_url: "https://x/9" };
  const brokenIssue = await report({
    env: { GITHUB_REPOSITORY: "o/r" },
    api: fakeApi({ runs: [run], jobs: [] }),
    readIssueComments: async () => { throw new Error("HTTP 404"); },
    log() {},
  });
  assert.equal(brokenIssue.posted, false);
});
