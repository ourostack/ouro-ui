// Puts the docs pin pull request at the front of the merge queue when the docs are far behind, because main's
// docs name a release older than the site should show (ourostack/ouro-ui#3968). A pin is only version literals, so it
// carries no risk a queue position protects, yet a busy queue can hold it for hours.
//
// It jumps only when every condition holds: the pin's own checks have passed (merge state CLEAN, so it is ready to
// enqueue), it is not in the queue and not already jumped (the `pin-jumped` label), its diff is exactly the docs pin's
// version-literal files (scripts/pin-only.mjs), main's docs are more than 5 releases or more than 3 hours behind,
// no red-main-fix pull request is in the queue, and no jump happened in the last hour anywhere in the repository.
// Each jump is logged on issue #2469 with the lag, and that log is the hourly limit's record.
//
//   node scripts/docs-pin-jump.mjs        (reads and acts through gh; GH_TOKEN needs pull-requests and issues write)
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pinProblems } from "./pin-only.mjs";

export const maxReleasesBehind = 5;
export const maxHoursBehind = 3;
export const jumpIntervalMs = 60 * 60 * 1000;
export const jumpLabel = "pin-jumped";
export const logIssue = 2469;
export const logMarker = "<!-- docs-pin-jump -->";

/**
 * Whether to jump the pin, and why not when it is not. `lag` is `{ releases, hours }` of main's docs behind the newest
 * release; `queueLabels` the labels of each queue entry; `lastJumpAt` the time of the latest logged jump, or null.
 */
export function decide({ pr, problems, lag, queueLabels, lastJumpAt, now }) {
  if (!pr) return { jump: false, reason: "no docs pin pull request is open" };
  if (pr.labels.includes(jumpLabel)) return { jump: false, reason: `#${pr.number} already has ${jumpLabel}` };
  if (pr.isInMergeQueue) return { jump: false, reason: `#${pr.number} is already in the queue` };
  if (pr.mergeStateStatus !== "CLEAN") return { jump: false, reason: `#${pr.number}'s own checks have not passed (merge state ${pr.mergeStateStatus})` };
  if (problems.length > 0) return { jump: false, reason: `#${pr.number} changes more than the pin's version literals: ${problems.join("; ")}` };
  if (!(lag.releases > maxReleasesBehind || lag.hours > maxHoursBehind)) {
    return { jump: false, reason: `the docs are ${lag.releases} releases and ${lag.hours.toFixed(1)} h behind, within ${maxReleasesBehind} releases and ${maxHoursBehind} h` };
  }
  if (queueLabels.some((labels) => labels.includes("red-main-fix"))) return { jump: false, reason: "a red-main-fix pull request is in the queue" };
  if (lastJumpAt !== null && now - lastJumpAt < jumpIntervalMs) return { jump: false, reason: "a pin jumped less than an hour ago" };
  return { jump: true, reason: `the docs are ${lag.releases} releases and ${lag.hours.toFixed(1)} h behind` };
}

/** How far main's docs tag is behind: the releases newer than it, and the hours since the oldest of them was published. */
export function lagOf(tag, releases, now) {
  const index = releases.findIndex((release) => release.tag === tag);
  const newer = index === -1 ? releases : releases.slice(0, index);
  if (newer.length === 0) return { releases: 0, hours: 0 };
  const oldest = Math.min(...newer.map((release) => release.publishedAt));
  return { releases: newer.length, hours: (now - oldest) / 3_600_000 };
}

function gh(args, input) {
  return execFileSync("gh", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }).trim();
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function contentAt(rev, path) {
  try {
    return git(["show", `${rev}:${path}`]);
  } catch {
    return null;
  }
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const [owner, name] = repo.split("/");
  const now = Date.now();
  const listed = JSON.parse(gh(["pr", "list", "--head", "docs/point-at-release", "--base", "main", "--state", "open", "--json", "number,id,labels,isInMergeQueue,mergeStateStatus,headRefOid"]));
  const found = listed[0];
  const pr = found && { number: found.number, labels: found.labels.map((label) => label.name), isInMergeQueue: found.isInMergeQueue, mergeStateStatus: found.mergeStateStatus };
  let problems = [];
  let lag = { releases: 0, hours: 0 };
  let queueLabels = [];
  let lastJumpAt = null;
  if (found && !pr.labels.includes(jumpLabel) && !pr.isInMergeQueue && pr.mergeStateStatus === "CLEAN") {
    git(["fetch", "-q", "--depth=1", "origin", "main", `pull/${found.number}/head`]);
    const base = git(["rev-parse", "origin/main"]).trim();
    const head = "FETCH_HEAD";
    const paths = git(["diff", "--name-only", base, head]).split("\n").filter(Boolean);
    problems = pinProblems(paths.map((path) => ({ path, before: contentAt(base, path), after: contentAt(head, path) })));
    const mainTag = JSON.parse(contentAt(base, "package.json")).ouro.latestRelease;
    const releases = JSON.parse(gh(["api", `repos/${repo}/releases?per_page=100`])).map((release) => ({ tag: release.tag_name, publishedAt: Date.parse(release.published_at) }));
    lag = lagOf(mainTag, releases, now);
    const queue = JSON.parse(gh(["api", "graphql", "-f", `query=query{repository(owner:"${owner}",name:"${name}"){mergeQueue(branch:"main"){entries(first:100){nodes{pullRequest{labels(first:30){nodes{name}}}}}}}}`]));
    queueLabels = (queue.data.repository.mergeQueue?.entries.nodes ?? []).map((entry) => entry.pullRequest.labels.nodes.map((label) => label.name));
    const comments = JSON.parse(gh(["api", `repos/${repo}/issues/${logIssue}/comments?per_page=100`, "--paginate", "--slurp"])).flat();
    const jumps = comments.filter((comment) => comment.body.includes(logMarker)).map((comment) => Date.parse(comment.created_at));
    lastJumpAt = jumps.length > 0 ? Math.max(...jumps) : null;
  }
  const verdict = decide({ pr, problems, lag, queueLabels, lastJumpAt, now });
  console.log(`${verdict.jump ? "Jumping" : "Not jumping"}: ${verdict.reason}.`);
  if (!verdict.jump) return;
  gh(["api", "graphql", "-f", "query=mutation($id:ID!){enqueuePullRequest(input:{pullRequestId:$id,jump:true}){mergeQueueEntry{position}}}", "-f", `id=${found.id}`]);
  gh(["pr", "edit", String(pr.number), "--add-label", jumpLabel]);
  gh(["issue", "comment", String(logIssue), "--body-file", "-"], `${logMarker}\nJumped docs pin #${pr.number} to the front of the merge queue: ${verdict.reason}. Its diff is only version literals, and the pull request is frozen (${jumpLabel}) until the queue merges or drops it.\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
