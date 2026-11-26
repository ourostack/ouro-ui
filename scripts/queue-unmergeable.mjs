// Fixes a merge-queue entry that GitHub marks UNMERGEABLE, which otherwise holds every entry behind it
// (#2469's stalls). It acts on at most one entry per run, and only on state UNMERGEABLE:
//   - a branch that conflicts with main for real: comments and pings its author; nothing is dequeued;
//   - a branch that merges cleanly (git merge-tree), has no failing ceiling check, and whose merge with
//     main leaves every ceiling anchor's own change as the pull request made it: dequeues it, updates the
//     branch from main, turns auto-merge back on and comments;
//   - anything else: comments and leaves it where it is.
// Every action is logged on issue 2469.
//
//   GH_TOKEN=… GH_REPO=ourostack/ouro-ui node scripts/queue-unmergeable.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { anchors as declared, declaredSum } from "./ceiling-ratchet.mjs";

export const LOG_ISSUE = 2469;

/** The first UNMERGEABLE entry of the queue's nodes, or null. */
export function firstUnmergeable(nodes) {
  return nodes.find((entry) => entry.state === "UNMERGEABLE") ?? null;
}

/** True when a status check on the pull request is a failing ceiling check. */
export function ceilingCheckFailing(contexts) {
  return contexts.some(({ name, conclusion }) => /ceiling/i.test(name ?? "") && ["FAILURE", "TIMED_OUT", "CANCELLED"].includes(conclusion));
}

/**
 * The anchors whose change after the merge differs from the pull request's own change: `merged - main`
 * against `head - base`, per anchor. Each entry reads `{ id, base, head, main, merged }` (null when absent).
 */
export function anchorDrift(rows) {
  return rows.filter(({ base, head, main, merged }) => (merged ?? 0) - (main ?? 0) !== (head ?? 0) - (base ?? 0));
}

/** What to do with an UNMERGEABLE entry. */
export function decide({ conflicts, ceilingFailing, drift }) {
  if (conflicts) return "conflict";
  if (ceilingFailing) return "skip-ceiling-check";
  if (drift.length > 0) return "skip-drift";
  return "update";
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
}

function gh(args, input) {
  return sh("gh", args, input === undefined ? {} : { input });
}

function showAt(rev, path) {
  try {
    return sh("git", ["show", `${rev}:${path}`], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

function sums(rev) {
  return Object.fromEntries(
    declared.map(({ id, file, name, key }) => {
      const text = showAt(rev, file);
      return [id, text === null ? null : declaredSum(text, name, key)];
    }),
  );
}

function log(number, text) {
  gh(["pr", "comment", String(number), "--body", text]);
  gh(["issue", "comment", String(LOG_ISSUE), "--body", `Queue watcher, #${number}: ${text}`]);
}

function main() {
  const [owner, name] = process.env.GH_REPO.split("/");
  const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeQueue{entries(first:100){nodes{state pullRequest{id number headRefOid author{login}}}}}}}`;
  const result = JSON.parse(gh(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `name=${name}`]));
  const entry = firstUnmergeable(result.data.repository.mergeQueue?.entries.nodes ?? []);
  if (!entry) return console.log("No UNMERGEABLE entry in the queue.");
  const { id, number, headRefOid, author } = entry.pullRequest;
  const contexts = JSON.parse(gh(["pr", "view", String(number), "--json", "statusCheckRollup"])).statusCheckRollup ?? [];
  sh("git", ["fetch", "--no-tags", "origin", "main", `pull/${number}/head`]);
  const head = sh("git", ["rev-parse", "FETCH_HEAD"]).trim();
  const tip = sh("git", ["rev-parse", "origin/main"]).trim();
  const merge = (() => {
    try {
      return { tree: sh("git", ["merge-tree", "--write-tree", tip, head]).split("\n")[0], conflicts: false };
    } catch {
      return { tree: null, conflicts: true };
    }
  })();
  const base = sh("git", ["merge-base", tip, head]).trim();
  const [b, h, m] = [sums(base), sums(head), sums(tip)];
  const g = merge.conflicts ? {} : sums(merge.tree);
  const drift = merge.conflicts ? [] : anchorDrift(declared.map(({ id: anchor }) => ({ id: anchor, base: b[anchor], head: h[anchor], main: m[anchor], merged: g[anchor] })));
  const action = decide({ conflicts: merge.conflicts, ceilingFailing: ceilingCheckFailing(contexts), drift });
  console.log(`#${number}: ${action}`);
  if (action === "conflict") {
    return log(number, `@${author.login} this branch conflicts with main (git merge-tree), so it is UNMERGEABLE in the merge queue and holds the entries behind it. Fix: rebase it onto main and resolve the conflict. Nothing was dequeued.`);
  }
  if (action !== "update") {
    const why = action === "skip-drift" ? `merging main changes the ceiling anchors ${drift.map(({ id: anchor }) => anchor).join(", ")} beyond this pull request's own diff` : "it has a failing ceiling check";
    return log(number, `@${author.login} UNMERGEABLE in the queue, but left alone: ${why}. Fix: update the branch by hand.`);
  }
  gh(["api", "graphql", "-f", `query=mutation($id:ID!){dequeuePullRequest(input:{id:$id}){mergeQueueEntry{id}}}`, "-f", `id=${id}`]);
  gh(["api", "-X", "PUT", `repos/${process.env.GH_REPO}/pulls/${number}/update-branch`, "-f", `expected_head_sha=${headRefOid}`]);
  gh(["pr", "merge", String(number), "--auto", "--squash"]);
  log(number, `@${author.login} this branch merged cleanly with main (git merge-tree) but was UNMERGEABLE in the queue. It was dequeued, updated from main (no ceiling anchor changed beyond its own diff) and auto-merge is back on.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
