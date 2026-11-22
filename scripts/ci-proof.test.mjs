import assert from "node:assert/strict";
import { test } from "node:test";
import { ghApi, isQueueRun, PREFIX, prove } from "./ci-proof.mjs";

// The tree proof (scripts/ci-proof.mjs): a push to main skips the suite only when the merge queue's run passed on
// that very commit, or when the newest run of the pull request merged as it passed the full suite on the same tree.

const main = "m".repeat(40);
const head = "h".repeat(40);
const tree = "t".repeat(40);
const other = "o".repeat(40);

const run = (id, { event = "pull_request", status = "completed", conclusion = "success", sha = head, branch = "fix" } = {}) => ({
  id,
  event,
  status,
  conclusion,
  head_sha: sha,
  head_branch: branch,
  html_url: `https://github.com/o/r/actions/runs/${id}`,
});
const job = (name, conclusion = "success", status = "completed") => ({ name, conclusion, status });

/** An API whose answers the test writes; `runs` and `jobs` may be functions of the read's index, to change as it waits. */
function fake({ runs = [], jobs = {}, heads = [head], trees = { [main]: tree }, broken = false } = {}) {
  let reads = 0;
  const calls = [];
  return {
    calls,
    tree: async (sha) => {
      if (broken) throw new Error("HTTP 502");
      return trees[sha];
    },
    mergedHeads: async () => heads,
    runs: async (sha) => {
      calls.push(`runs ${sha.slice(0, 1)}`);
      const list = typeof runs === "function" ? runs(reads++) : runs;
      return list.filter((entry) => entry.head_sha === sha);
    },
    jobs: async (id) => {
      calls.push(`jobs ${id}`);
      const map = typeof jobs === "function" ? jobs(reads) : jobs;
      return map[id] ?? [];
    },
  };
}

const proved = async (api, options) => (await prove(api, main, { pause: async () => {}, ...options })).run?.id ?? null;

test("a pull request's newest run that passed the full suite on the main commit's tree proves it", async () => {
  assert.equal(await proved(fake({ runs: [run(1)], jobs: { 1: [job("ci"), job(PREFIX + tree)] } })), 1);
});

test("the merge queue's passed run on the main commit itself proves it, with no tree-proof job", async () => {
  assert.equal(await proved(fake({ runs: [run(2, { event: "merge_group", sha: main, branch: "gh-readonly-queue/main/pr-9-abc" })], heads: [] })), 2);
  assert.equal(await proved(fake({ runs: [run(3, { event: "workflow_dispatch", sha: main, branch: "gh-readonly-queue/main/pr-9-abc" })], heads: [] })), 3);
  assert.equal(isQueueRun(run(4, { event: "workflow_dispatch", branch: "release/v1.0.0" })), false);
  assert.equal(await proved(fake({ runs: [run(5, { event: "merge_group", sha: main, conclusion: "failure" })], heads: [] })), null);
});

test("a run on another tree, a red, cancelled or unfinished run, or a skipped tree-proof job proves nothing", async () => {
  const cases = {
    "another tree": [run(1), { 1: [job(PREFIX + other)] }],
    "a red run with its tree-proof job green": [run(1, { conclusion: "failure" }), { 1: [job(PREFIX + tree)] }],
    "a cancelled run": [run(1, { conclusion: "cancelled" }), { 1: [job(PREFIX + tree)] }],
    "an unfinished run past the wait": [run(1, { status: "in_progress", conclusion: null }), { 1: [job(PREFIX + tree)] }],
    "a skipped tree-proof job (the plan left tests out)": [run(1), { 1: [job(PREFIX + tree, "skipped")] }],
    "a skipped tree-proof job listed under its unevaluated name": [run(1), { 1: [job(`${PREFIX}\${{ needs.plan.outputs.tree }}`, "skipped")] }],
    "a passed run with no tree-proof job": [run(1), { 1: [job("ci")] }],
    "a push run on the commit": [run(1, { event: "push", sha: main, branch: "main" }), { 1: [job(PREFIX + tree)] }],
  };
  for (const [name, [entry, jobs]] of Object.entries(cases)) assert.equal(await proved(fake({ runs: [entry], jobs })), null, name);
});

test("only the newest pull request run on the head counts: a red run after a green one takes the proof back", async () => {
  const jobs = { 1: [job(PREFIX + tree)], 2: [job(PREFIX + tree)] };
  assert.equal(await proved(fake({ runs: [run(1), run(2, { conclusion: "failure" })], jobs })), null);
  assert.equal(await proved(fake({ runs: [run(1, { conclusion: "failure" }), run(2)], jobs })), 2);
});

test("a commit no pull request was merged as is proved only by a run on itself", async () => {
  assert.equal(await proved(fake({ runs: [run(1)], heads: [], jobs: { 1: [job(PREFIX + tree)] } })), null);
  // A pull request's head pushed to main as it is: its own pull request run on that commit.
  assert.equal(await proved(fake({ runs: [run(1, { sha: main })], heads: [], jobs: { 1: [job(PREFIX + tree)] } })), 1);
});

test("it waits for the merged pull request's run to finish, and stops waiting once that run names another tree", async () => {
  // Required checks pass, the pull request merges, and tree-proof is still finishing.
  const finishing = (reads) => [run(1, reads < 3 ? { status: "in_progress", conclusion: null } : {})];
  const pauses = [];
  const result = await prove(fake({ runs: finishing, jobs: { 1: [job(PREFIX + tree)] } }), main, { wait: 600, pause: async (ms) => pauses.push(ms) });
  assert.equal(result.run?.id, 1);
  assert.equal(pauses.length, 2);
  // Without a wait an unfinished run proves nothing.
  assert.equal(await proved(fake({ runs: finishing, jobs: { 1: [job(PREFIX + tree)] } }), { wait: 0 }), null);
  // A tree-proof job for another tree ends the wait at once.
  const moved = [];
  assert.equal(await proved(fake({ runs: [run(1, { status: "in_progress", conclusion: null })], jobs: { 1: [job(PREFIX + other, null, "in_progress")] } }), { wait: 600, pause: async (ms) => moved.push(ms) }), null);
  assert.deepEqual(moved, []);
  // And the wait ends at its deadline.
  let clock = 0;
  const waited = [];
  const stuck = fake({ runs: [run(1, { status: "in_progress", conclusion: null })], jobs: { 1: [] } });
  assert.equal(await proved(stuck, { wait: 60, pollMs: 15_000, now: () => clock, pause: async (ms) => { waited.push(ms); clock += ms; } }), null);
  assert.equal(waited.length, 4);
});

test("when GitHub cannot be read it throws, and the caller runs everything", async () => {
  await assert.rejects(prove(fake({ broken: true }), main));
});

test("the API reads ci.yml's runs on a commit, a run's latest jobs, and the pull requests merged as the commit", () => {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(" "));
    const url = args.at(-1);
    if (url.endsWith(`commits/${main}`)) return JSON.stringify({ commit: { tree: { sha: tree } } });
    if (url.includes("/pulls")) return JSON.stringify([{ merged_at: "x", merge_commit_sha: main, head: { sha: head } }, { merged_at: null, merge_commit_sha: main, head: { sha: other } }, { merged_at: "x", merge_commit_sha: other, head: { sha: other } }]);
    if (url.includes("/jobs")) return JSON.stringify([{ jobs: [job("a")] }, { jobs: [job("b")] }]);
    return JSON.stringify([{ workflow_runs: [run(1)] }]);
  };
  const api = ghApi("o/r", gh);
  assert.equal(api.tree(main), tree);
  assert.deepEqual(api.mergedHeads(main), [head]);
  assert.deepEqual(api.runs(head).map((entry) => entry.id), [1]);
  assert.deepEqual(api.jobs(1).map((entry) => entry.name), ["a", "b"]);
  assert.ok(calls.includes(`api --paginate --slurp repos/o/r/actions/workflows/ci.yml/runs?head_sha=${head}&per_page=100`));
  assert.ok(calls.includes("api --paginate --slurp repos/o/r/actions/runs/1/jobs?filter=latest&per_page=100"));
});
