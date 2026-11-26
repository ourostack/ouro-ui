// The claims lint that claims.yml runs on a pull request, run before a push instead, so a title,
// body or change fragment it would fail never costs a CI run. The pre-push hook
// (scripts/git-hooks/pre-push, which scripts/install-hooks.mjs installs on `pnpm i`) runs it.
// It reads the open pull request of the branch being pushed with `gh`, when gh can, and lints its
// title and body with the change fragments the branch adds; without one it lints the fragments
// alone. Before that it refuses a push to a branch whose open pull request is in the merge queue,
// because a push removes that pull request from the queue and cancels every group behind it
// (ourostack/ouro-ui#3849); it allows the push when gh can't answer. CI skips it, and `git push --no-verify` skips it once.
//
//   node scripts/pre-push.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readStdin } from "./read-stdin.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const queueQuery = "query($branch: String!) { repository(owner: \"ourostack\", name: \"ouro-ui\") { pullRequests(headRefName: $branch, states: OPEN, first: 1) { nodes { number isInMergeQueue } } } }";

/**
 * The open pull request of `branch` that is in the merge queue: `{ number }`, `null` when there is
 * none, or `{ unknown: <why> }` when gh can't say.
 */
export function queuedPullRequest(branch, run = spawnSync) {
  if (!branch) return null;
  const result = run("gh", ["api", "graphql", "-f", `query=${queueQuery}`, "-F", `branch=${branch}`], { cwd: root, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return { unknown: "gh could not answer" };
  try {
    const nodes = JSON.parse(result.stdout).data?.repository?.pullRequests?.nodes;
    if (!Array.isArray(nodes)) return { unknown: "gh gave no pull request data" };
    const queued = nodes.find((node) => node.isInMergeQueue);
    return queued ? { number: queued.number } : null;
  } catch {
    return { unknown: "gh gave an answer that was not JSON" };
  }
}

/** The open pull request's title and body for `branch`, or an empty text when gh can't say. */
export function pullRequestText(branch, run = spawnSync) {
  if (!branch) return { title: "", body: "" };
  const result = run("gh", ["pr", "view", branch, "--repo", "ourostack/ouro-ui", "--json", "title,body,state"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout) return { title: "", body: "" };
  try {
    const pr = JSON.parse(result.stdout);
    return pr.state === "OPEN" ? { title: pr.title ?? "", body: pr.body ?? "" } : { title: "", body: "" };
  } catch {
    return { title: "", body: "" };
  }
}

/**
 * The branch being pushed, from the lines git gives a pre-push hook on its standard input
 * (`<local ref> <local sha> <remote ref> <remote sha>`), or else the checked-out branch.
 */
export function pushedBranch(input) {
  for (const line of input.split("\n")) {
    const remote = line.trim().split(/\s+/)[2] ?? "";
    if (remote.startsWith("refs/heads/")) return remote.slice("refs/heads/".length);
  }
  return spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim() ?? "";
}

export function main(env = process.env, input = "") {
  if (env.CI) return 0;
  const branch = pushedBranch(input);
  const queued = queuedPullRequest(branch);
  if (queued?.number) {
    process.stderr.write(`Pull request #${queued.number} is in the merge queue, and a push removes it and cancels every group behind it. Take it out first: gh pr merge ${queued.number} --disable-auto --repo ourostack/ouro-ui. Then push, and let auto-merge queue it again once its own checks pass. git push --no-verify skips this check once.\n`);
    return 1;
  }
  if (queued?.unknown) process.stderr.write(`Merge queue check skipped: ${queued.unknown}, so the push goes ahead.\n`);
  const { title, body } = pullRequestText(branch);
  const dir = mkdtempSync(join(tmpdir(), "ouro-pre-push-"));
  try {
    const file = join(dir, "body.md");
    writeFileSync(file, body);
    const lint = spawnSync(process.execPath, [join(root, "scripts/claims.mjs"), "lint", "--pr", "--title", title, "--body-file", file], { cwd: root, stdio: "inherit" });
    if (lint.status === 0) return 0;
    process.stderr.write("The claims lint would fail this branch's pull request in CI. Fix the title or body (gh pr edit) or the change fragment, then push again; git push --no-verify skips this check once.\n");
    return lint.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main(process.env, process.stdin.isTTY ? "" : await readStdin()));
