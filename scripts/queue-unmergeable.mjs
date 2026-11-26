// An UNMERGEABLE merge queue entry stalls every entry behind it until a lane rebases it
// (.github/workflows/queue-unmergeable.yml runs this every 10 minutes). One entry per run:
// dequeue it, check with `git merge-tree` whether main merges into it cleanly, and when it does,
// update its branch from main and re-arm auto-merge, so it re-enters the queue at the back.
// When it does not merge cleanly the pull request stays out of the queue and its author is
// pinged with the conflicting files. Each action is logged as a comment on #2469.
//
//   node scripts/queue-unmergeable.mjs run
//       needs gh with GH_TOKEN, GITHUB_REPOSITORY, and a checkout with full history. A read that
//       fails changes nothing: the run stops before it dequeues anything.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** The issue each action is logged on. */
export const LOG_ISSUE = 2469;

/** The first queue entry whose state is UNMERGEABLE, or undefined. `entries` come in queue order. */
export function pickUnmergeable(entries) {
  return entries.find((entry) => entry.state === "UNMERGEABLE");
}

/** What a `git merge-tree --write-tree` exit code means: 0 merges cleanly, 1 has conflicts, anything else is unknown. */
export function mergeVerdict(exitCode) {
  if (exitCode === 0) return "clean";
  if (exitCode === 1) return "conflict";
  return "unknown";
}

/** The conflicted paths in `git merge-tree --write-tree --name-only` output: the lines after the tree id, up to the blank line. */
export function conflictedPaths(output) {
  const lines = output.split("\n");
  const blank = lines.indexOf("");
  const paths = lines.slice(1, blank === -1 ? lines.length : blank);
  return [...new Set(paths.filter(Boolean))];
}

/** The log line for #2469, naming the pull request, what was done and why. */
export function logLine({ number, position, verdict, paths = [] }) {
  const where = `#${number} (queue position ${position})`;
  if (verdict === "clean") return `${where} was UNMERGEABLE: dequeued, updated from main (a clean merge) and re-armed on auto-merge.`;
  if (verdict === "conflict") return `${where} was UNMERGEABLE: dequeued and left out, main conflicts with ${paths.length} file(s): ${paths.map((path) => `\`${path}\``).join(", ") || "unknown"}.`;
  return `${where} was UNMERGEABLE: dequeued and left out, the merge check could not run.`;
}

/** The comment that pings a pull request's author when main conflicts with it. */
export function conflictComment({ author, paths }) {
  const list = paths.map((path) => `- \`${path}\``).join("\n");
  return `@${author} this pull request was removed from the merge queue because main conflicts with it, which stalled the entries behind it. Rebase it, resolve these files, and re-arm auto-merge:\n\n${list}`;
}

const gh = (args, input) => execFileSync("gh", args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
const git = (args) => {
  try {
    return { code: 0, out: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { code: error.status ?? 2, out: String(error.stdout ?? "") };
  }
};

const QUEUE = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeQueue{entries(first:100){nodes{state position pullRequest{id number headRefOid author{login}}}}}}}`;

function readQueue(repo) {
  const [owner, name] = repo.split("/");
  const data = JSON.parse(gh(["api", "graphql", "-f", `query=${QUEUE}`, "-F", `owner=${owner}`, "-F", `name=${name}`]));
  return data.data.repository.mergeQueue?.entries.nodes ?? [];
}

const comment = (repo, number, body) => gh(["api", "-X", "POST", `repos/${repo}/issues/${number}/comments`, "-f", `body=${body}`]);

export function run(repo) {
  const entry = pickUnmergeable(readQueue(repo));
  if (!entry) return console.log("No UNMERGEABLE entry in the queue.");
  const { number, id, headRefOid, author } = entry.pullRequest;
  gh(["api", "graphql", "-f", `query=mutation($id:ID!){dequeuePullRequest(input:{id:$id}){clientMutationId}}`, "-F", `id=${id}`]);
  console.log(`Dequeued #${number}.`);
  git(["fetch", "--quiet", "origin", "main", `pull/${number}/head:refs/pr/${number}`]);
  const merge = git(["merge-tree", "--write-tree", "--name-only", "origin/main", `refs/pr/${number}`]);
  const verdict = mergeVerdict(merge.code);
  const paths = verdict === "conflict" ? conflictedPaths(merge.out) : [];
  if (verdict === "clean") {
    gh(["api", "-X", "PUT", `repos/${repo}/pulls/${number}/update-branch`, "-f", `expected_head_sha=${headRefOid}`]);
    gh(["api", "graphql", "-f", `query=mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}`, "-F", `id=${id}`]);
  } else if (verdict === "conflict") {
    comment(repo, number, conflictComment({ author: author?.login ?? "author", paths }));
  }
  const line = logLine({ number, position: entry.position, verdict, paths });
  comment(repo, LOG_ISSUE, line);
  console.log(line);
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "run") run(process.env.GITHUB_REPOSITORY);
