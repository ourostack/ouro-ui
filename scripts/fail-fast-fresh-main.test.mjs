import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyLogged, candidateComment, candidateMarker, report } from "./fail-fast-fresh-main.mjs";

const run = (overrides = {}) => ({ id: 1, head_sha: "s1", status: "completed", conclusion: "success", html_url: "https://x/1", ...overrides });

test("candidateMarker and alreadyLogged dedupe one log comment per green sha", () => {
  const bodies = [`some text\n${candidateMarker("abc1234")}\nmore`];
  assert.equal(alreadyLogged(bodies, "abc1234"), true);
  assert.equal(alreadyLogged(bodies, "other"), false);
});

test("candidateComment names what a fresh-main-tolerant watcher would have kept going, and always says it still cancels these runs today", () => {
  const state = { sha: "abc1234567", url: "https://x/run" };
  const withCandidates = candidateComment({ state, prevented: [{ number: 10, runId: 100 }] });
  assert.ok(withCandidates.includes("would NOT have cancelled #10"));
  assert.ok(withCandidates.includes("still cancels these runs"));
  const empty = candidateComment({ state, prevented: [] });
  assert.ok(empty.includes("no pull request run was cancelled by the fresh-main cascade"));
});

/** An in-process stand-in for main-green.mjs's ghApi, shaped like cascade-retrigger.test.mjs's own. */
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
      return { total_count: (jobsByRunId[id] ?? []).length, jobs: jobsByRunId[id] ?? [] };
    }
    throw new Error(`no route for ${path}`);
  };
}

test("fail-fast-fresh-main's report does nothing while main did not just turn green", async () => {
  const logged = [];
  const result = await report({ env: { GITHUB_REPOSITORY: "o/r" }, api: fakeApi({ pushRuns: [run({ conclusion: "success" }), run({ conclusion: "success" })] }), log: (line) => logged.push(line) });
  assert.deepEqual(result, { posted: false });
  assert.ok(logged.some((line) => line.includes("did not just turn")));
});

test("report logs, once per green sha on #3820, only the cascade-cancelled auto-merge pull request runs where fresh-main was the sole failure", async () => {
  const pushRuns = [run({ head_sha: "green1", conclusion: "success" }), run({ head_sha: "red1", conclusion: "failure" })];
  const pulls = [
    { number: 30, head: { sha: "sha-cascade" }, auto_merge: { enabled_by: { login: "x" } } },
    { number: 31, head: { sha: "sha-other-fail" }, auto_merge: { enabled_by: { login: "x" } } },
    { number: 32, head: { sha: "sha-not-auto" }, auto_merge: null },
  ];
  const runsBySha = {
    "sha-cascade": { id: 201, status: "completed", conclusion: "cancelled", run_attempt: 1 },
    "sha-other-fail": { id: 202, status: "completed", conclusion: "cancelled", run_attempt: 1 },
  };
  const jobsByRunId = {
    // fresh-main failed, the other job was cancelled as ci-fail-fast's own collateral: a cascade.
    201: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "cancelled" }],
    // fresh-main failed, but the other job genuinely failed too (not merely cancelled): not a cascade.
    202: [{ name: "fresh-main", status: "completed", conclusion: "failure" }, { name: "browser (1/6)", status: "completed", conclusion: "failure" }],
  };
  const api = fakeApi({ pushRuns, pulls, runsBySha, jobsByRunId });
  const posts = [];
  const common = { env: { GITHUB_REPOSITORY: "o/r", GH_TOKEN: "t" }, api, readIssueComments: async () => posts.map((post) => post.body), writeIssueComment: async (args) => posts.push(args), log() {} };
  const first = await report(common);
  assert.equal(first.posted, true, "nothing is logged yet for this sha, so it posts once");
  assert.equal(first.result.prevented.length, 1, "only the cascade run (#30) counts; #31 genuinely failed and #32 has no auto-merge");
  assert.equal(first.result.prevented[0].number, 30);
  assert.ok(posts[0].body.includes("would NOT have cancelled #30"));
  assert.ok(!posts[0].body.includes("#31"), "a run cancelled for a real failure is never a candidate at all");
  assert.ok(!posts[0].body.includes("#32"), "a pull request with no auto-merge is never a candidate");
  const second = await report(common);
  assert.equal(second.posted, false);
  assert.equal(posts.length, 1, "the same green sha is logged only once");
});

test("fail-fast-fresh-main's report fails open and never throws when main's runs or the issue cannot be read", async () => {
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
