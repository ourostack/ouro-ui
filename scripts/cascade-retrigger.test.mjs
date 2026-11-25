import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyLogged, candidateComment, candidateMarker, cascadeVerdict, report, retriggerPlan, transitionedToGreen } from "./cascade-retrigger.mjs";

const run = (overrides = {}) => ({ id: 1, head_sha: "s1", status: "completed", conclusion: "success", html_url: "https://x/1", ...overrides });

test("transitionedToGreen is true only when the newest decisive run succeeded and the one before it did not", () => {
  assert.equal(transitionedToGreen([run({ conclusion: "success" }), run({ conclusion: "failure" })]), true);
  assert.equal(transitionedToGreen([run({ conclusion: "success" }), run({ conclusion: "success" })]), false, "green staying green is not a transition");
  assert.equal(transitionedToGreen([run({ conclusion: "failure" }), run({ conclusion: "success" })]), false, "the newest run itself must be the green one");
  assert.equal(transitionedToGreen([run({ conclusion: "success" })]), false, "no prior decisive run: nothing to transition from");
  assert.equal(transitionedToGreen([]), false);
  // A still-running or cancelled run in between is not decisive, and is skipped when finding the prior run.
  assert.equal(
    transitionedToGreen([run({ conclusion: "success" }), run({ status: "in_progress", conclusion: null }), run({ conclusion: "cancelled" }), run({ conclusion: "failure" })]),
    true,
  );
});

test("cascadeVerdict finds only a run fresh-main failed and every other job was cancelled or skipped for, never a run cancelled for a real failure or not cancelled at all", () => {
  const cancelled = run({ conclusion: "cancelled" });
  assert.equal(cascadeVerdict({ run: run({ conclusion: "success" }), jobs: [] }), "not-cancelled");
  assert.equal(
    cascadeVerdict({ run: cancelled, jobs: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "cancelled" }] }),
    "cascade",
  );
  assert.equal(
    cascadeVerdict({ run: cancelled, jobs: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "skipped" }] }),
    "cascade",
    "a job that skipped (never ran) still reads as cascade",
  );
  assert.equal(
    cascadeVerdict({ run: cancelled, jobs: [{ name: "browser (1/6)", status: "completed", conclusion: "cancelled" }] }),
    "other",
    "no fresh-main failure named: cancelled for some other reason",
  );
  assert.equal(
    cascadeVerdict({ run: cancelled, jobs: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "failure" }] }),
    "other",
    "a real job failure alongside fresh-main: never counted as the cascade",
  );
});

test("retriggerPlan stays under maxLive, re-triggering what fits and deferring the rest, never going negative on room", () => {
  const candidates = [{ number: 1, runId: 1 }, { number: 2, runId: 2 }, { number: 3, runId: 3 }, { number: 4, runId: 4 }];
  assert.deepEqual(retriggerPlan({ candidates, liveCount: 0 }), { retrigger: candidates.slice(0, 3), deferred: candidates.slice(3) });
  assert.deepEqual(retriggerPlan({ candidates, liveCount: 2 }), { retrigger: candidates.slice(0, 1), deferred: candidates.slice(1) });
  assert.deepEqual(retriggerPlan({ candidates, liveCount: 10 }), { retrigger: [], deferred: candidates });
});

test("candidateMarker and alreadyLogged dedupe one plan comment per green sha", () => {
  const bodies = [`some text\n${candidateMarker("abc1234")}\nmore`];
  assert.equal(alreadyLogged(bodies, "abc1234"), true);
  assert.equal(alreadyLogged(bodies, "other"), false);
});

test("candidateComment names what it would re-trigger and defer, and always says it re-triggers nothing yet", () => {
  const state = { sha: "abc1234567", url: "https://x/run" };
  const withCandidates = candidateComment({ state, plan: { retrigger: [{ number: 10, runId: 100 }], deferred: [{ number: 11, runId: 101 }] } });
  assert.ok(withCandidates.includes("re-trigger #10"));
  assert.ok(withCandidates.includes("defer #11"));
  assert.ok(withCandidates.includes("re-triggers nothing yet"));
  const empty = candidateComment({ state, plan: { retrigger: [], deferred: [] } });
  assert.ok(empty.includes("no pull request run was cancelled by the fresh-main cascade"));
});

/** An in-process stand-in for main-green.mjs's ghApi: main's push runs, the open auto-merge pull requests, each one's latest pull_request CI run, and that run's jobs. */
function fakeApi({ pushRuns, pulls = [], runsBySha = {}, jobsByRunId = {} } = {}) {
  return (path) => {
    if (path.includes("branch=main")) return { workflow_runs: pushRuns };
    if (path.startsWith("repos/o/r/pulls?")) return pulls;
    if (path.includes("event=pull_request&head_sha=")) {
      const sha = decodeURIComponent(path.match(/head_sha=([^&]+)/)[1]);
      return { workflow_runs: runsBySha[sha] ? [runsBySha[sha]] : [] };
    }
    if (path.includes("/actions/runs/")) {
      const id = Number(path.match(/\/runs\/(\d+)\//)[1]);
      return { jobs: jobsByRunId[id] ?? [] };
    }
    throw new Error(`no route for ${path}`);
  };
}

test("report does nothing while main did not just turn green", async () => {
  const logged = [];
  const result = await report({ env: { GITHUB_REPOSITORY: "o/r" }, api: fakeApi({ pushRuns: [run({ conclusion: "success" }), run({ conclusion: "success" })] }), log: (line) => logged.push(line) });
  assert.deepEqual(result, { posted: false });
  assert.ok(logged.some((line) => line.includes("did not just turn")));
});

test("report logs the candidate re-trigger plan on #3802 once per green sha, naming only an auto-merge pull request's cascade-cancelled run", async () => {
  const pushRuns = [run({ head_sha: "green1", conclusion: "success" }), run({ head_sha: "red1", conclusion: "failure" })];
  const pulls = [
    { number: 20, head: { sha: "sha-cascade" }, auto_merge: { enabled_by: { login: "x" } } },
    { number: 21, head: { sha: "sha-other-fail" }, auto_merge: { enabled_by: { login: "x" } } },
    { number: 22, head: { sha: "sha-not-auto" }, auto_merge: null },
  ];
  const runsBySha = {
    "sha-cascade": { id: 101, status: "completed", conclusion: "cancelled" },
    "sha-other-fail": { id: 102, status: "completed", conclusion: "cancelled" },
  };
  const jobsByRunId = {
    101: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "cancelled" }],
    102: [{ name: "browser (1/6)", status: "completed", conclusion: "failure" }],
  };
  const api = fakeApi({ pushRuns, pulls, runsBySha, jobsByRunId });
  const posts = [];
  const common = { env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" }, api, readIssueComments: async () => posts.map((post) => post.body), writeIssueComment: async (args) => posts.push(args), log() {} };
  const first = await report(common);
  assert.equal(first.posted, true, "nothing is logged yet for this sha, so it posts once");
  assert.equal(first.result.plan.retrigger.length, 1, "only the cascade-cancelled auto-merge pull request is a candidate");
  assert.equal(first.result.plan.retrigger[0].number, 20);
  assert.equal(first.result.plan.deferred.length, 0);
  assert.ok(posts[0].body.includes("re-trigger #20"));
  assert.ok(!posts[0].body.includes("#21"), "a run cancelled for a real failure is never a candidate");
  assert.ok(!posts[0].body.includes("#22"), "a pull request with no auto-merge is never a candidate");
  const second = await report(common);
  assert.equal(second.posted, false);
  assert.equal(posts.length, 1, "the same green sha is logged only once");
});

test("cascade-retrigger's report fails open and never throws when main's runs or the issue cannot be read", async () => {
  const brokenRuns = await report({ env: { GITHUB_REPOSITORY: "o/r" }, api: () => { throw new Error("HTTP 500"); }, log() {} });
  assert.deepEqual(brokenRuns, { posted: false });
  const pushRuns = [run({ head_sha: "green1", conclusion: "success" }), run({ head_sha: "red1", conclusion: "failure" })];
  const brokenIssue = await report({
    env: { GITHUB_REPOSITORY: "o/r" },
    api: fakeApi({ pushRuns, pulls: [] }),
    readIssueComments: async () => { throw new Error("HTTP 404"); },
    log() {},
  });
  assert.equal(brokenIssue.posted, false);
});
