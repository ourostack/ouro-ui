import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isFast, judge, notNeeded, policy } from "./ci-gate.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
/** ci.yml's job ids, in order. */
const jobIds = [...ci.slice(ci.indexOf("\njobs:\n")).matchAll(/^ {2}([\w-]+):$/gm)].map((match) => match[1]);

const queue = { event: "merge_group", baseRef: "", headRef: "", ref: "refs/heads/gh-readonly-queue/main/pr-1-abc" };
const pull = { event: "pull_request", baseRef: "main", headRef: "feature", ref: "refs/pull/1/merge" };

/** Every job of the gate's policy with `result`, the plan with `outputs`, then `overrides`. */
function needs(result, overrides = {}, outputs = { installs: "queue" }) {
  const all = Object.fromEntries(Object.keys(policy).map((job) => [job, { result, outputs: {} }]));
  all.plan = { result: "success", outputs };
  for (const [job, value] of Object.entries(overrides)) all[job] = { result: value, outputs: job === "plan" ? outputs : {} };
  return all;
}

/** The jobs that skip by design on any run of this kind: none in the full suite but these. */
const neverInQueue = ["browser-fallback", "mutation-plan", "mutation-shard", "mutation", "install-latest", "install-github", "ci-budget"];

test("the merge queue passes only when every job of the full suite passed", () => {
  const passed = needs("success", Object.fromEntries(neverInQueue.map((job) => [job, "skipped"])));
  assert.equal(judge(passed, queue).pass, true);
  // Each job the full suite runs, skipped, fails the queue entry: a skipped check is no pass there.
  for (const job of Object.keys(policy).filter((id) => !neverInQueue.includes(id) && !["browser", "coverage"].includes(id))) {
    const { pass, lines } = judge({ ...passed, [job]: { result: "skipped", outputs: {} } }, queue);
    assert.equal(pass, false, job);
    assert.ok(lines.includes(`FAILED ${job}: skipped, required`), job);
  }
});

test("the gate reads the event, not the plan, to pick the suite: a plan that says fast in the queue still needs the full suite", () => {
  const fastLooking = needs("success", { latency: "skipped", lighthouse: "skipped", "theme-install": "skipped", install: "skipped", "install-upgrade": "skipped", "install-shard": "skipped", "install-gate": "skipped" }, { installs: "queue", full: "false" });
  assert.equal(judge(fastLooking, pull).pass, true);
  assert.equal(judge(fastLooking, queue).pass, false);
  assert.equal(isFast(queue), false);
  // A pull request from a release branch, or into another branch, runs the full suite too.
  assert.equal(isFast({ ...pull, headRef: "release/v1.2.3" }), false);
  assert.equal(isFast({ ...pull, baseRef: "next" }), false);
  assert.equal(judge(fastLooking, { ...pull, headRef: "release/v1.2.3" }).pass, false);
});

test("a fast pull request may leave out the full suite's own jobs, and must pass mutation testing and the budget", () => {
  const fast = needs("success", { latency: "skipped", lighthouse: "skipped", "theme-install": "skipped", install: "skipped", "install-upgrade": "skipped", "install-shard": "skipped", "install-gate": "skipped", "install-latest": "skipped", "install-github": "skipped", "browser-fallback": "skipped" });
  assert.equal(judge(fast, pull).pass, true);
  for (const job of ["mutation", "mutation-shard", "ci-budget", "visual", "e2e", "conformance", "themes", "checks", "ci"]) {
    assert.equal(judge({ ...fast, [job]: { result: "skipped", outputs: {} } }, pull).pass, false, job);
  }
  // When it changes the install test, its one install app must pass.
  const here = needs("success", { latency: "skipped", "install-shard": "skipped" }, { installs: "here" });
  assert.equal(judge(here, pull).pass, false);
  assert.equal(judge({ ...here, "install-shard": { result: "success", outputs: {} } }, pull).pass, true);
});

test("a failed or cancelled job fails the gate whatever the suite, and so does a skipped job the policy does not know", () => {
  for (const result of ["failure", "cancelled"]) {
    for (const run of [pull, queue]) {
      assert.equal(judge(needs("success", { latency: result }), pull).pass, false, `${run.event} ${result}`);
      assert.equal(judge(needs("success", { browser: result }), run).pass, false, `${run.event} ${result}`);
    }
  }
  const unknown = { ...needs("success"), "new-job": { result: "skipped", outputs: {} } };
  const { pass, lines } = judge(unknown, pull);
  assert.equal(pass, false);
  assert.ok(lines.includes("FAILED new-job: skipped, required (a job the gate's policy does not know)"));
  assert.equal(judge({ ...needs("success"), "new-job": { result: "success", outputs: {} } }, pull).pass, true);
  // No plan, nothing to judge.
  const { plan, ...noPlan } = needs("success");
  assert.ok(plan);
  assert.equal(judge(noPlan, pull).pass, false);
  assert.equal(judge(needs("success", { plan: "failure" }), pull).pass, false);
});

test("a push to main the merge queue already tested passes on install-github alone", () => {
  const push = { event: "push", baseRef: "", headRef: "", ref: "refs/heads/main" };
  const tested = needs("skipped", { "install-github": "success" }, { tested: "true" });
  assert.equal(judge(tested, push).pass, true);
  assert.equal(judge({ ...tested, "install-github": { result: "skipped", outputs: {} } }, push).pass, false);
  // Without the plan's word, the same skips fail.
  assert.equal(judge(needs("skipped", { "install-github": "success" }, {}), push).pass, false);
  // The word counts only on a push to main.
  assert.equal(judge(tested, queue).pass, false);
});

test("the gate needs every ci.yml job, its policy names exactly those, and nothing can skip it", () => {
  assert.ok(jobIds.includes("gate"));
  for (const id of notNeeded) assert.ok(jobIds.includes(id), id);
  const others = jobIds.filter((id) => !notNeeded.includes(id));
  assert.deepEqual(Object.keys(policy).sort(), others.sort());
  const block = ci.slice(ci.indexOf("\n  gate:\n") + 1).split(/\n {2}(?=[\w-]+:\n)/)[0];
  const listed = block.match(/^ {4}needs: \[(.+)\]$/m)[1].split(", ");
  assert.deepEqual(listed.sort(), others.sort());
  // It runs after cancelled and failed jobs too, so it is never a skipped check that would pass.
  assert.match(block, /^ {4}if: \$\{\{ always\(\) \}\}$/m);
  assert.match(block, /^ {4}name: gate$/m);
  assert.match(block, /^ {10}NEEDS: \$\{\{ toJSON\(needs\) \}\}$/m);
  assert.match(block, /^ {8}run: node scripts\/ci-gate\.mjs$/m);
});

test("the command fails on needs it cannot read, and on a failed job, with the job named", () => {
  const run = (env) => spawnSync(process.execPath, [join(root, "scripts/ci-gate.mjs")], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  assert.equal(run({ NEEDS: "not json" }).status, 1);
  const failed = run({ NEEDS: JSON.stringify(needs("success", { visual: "failure" })), EVENT: "merge_group", REF: queue.ref });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /^::error::FAILED visual: failure, required$/m);
  const passed = run({ NEEDS: JSON.stringify(needs("success", Object.fromEntries(neverInQueue.map((job) => [job, "skipped"])))), EVENT: "merge_group", REF: queue.ref });
  assert.equal(passed.status, 0, passed.stdout);
});
