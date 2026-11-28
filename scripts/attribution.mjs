// Keeps AI attribution off main (AGENTS.md: never add AI attribution). CI's attribution job, part of
// the required ci check, runs it over a pull request's commits (its base branch..its head) and, in
// the merge queue, over the squash commits the queue will put on main (merge_group base_sha..head_sha),
// whose messages GitHub writes from the commits' messages plus a Co-authored-by trailer for every
// commit author other than the pull request's. It fails on any commit that:
//
// - is authored by anyone but the maintainer, release.yml's github-actions[bot], which authors
//   the "Prepare main for the next release" commits, or Dependabot, whose commit may change only
//   dependency files (DEPENDENCY_FILES), may carry its own Signed-off-by trailer, and, as the squash's
//   author, its own Co-authored-by trailer (DEPENDABOT_CREDIT), or the project's own app, Ouro Current,
//   whose commit may only be GitHub's revert of a pull request (REVERT_SUBJECT), as screen-reader-revert.yml
//   opens it, or whose commit only merges main into a pull request's branch (queue-unmergeable.yml's update-branch):
//   two parents, the second already on the base, and a tree equal to the clean merge of its parents, so it adds nothing main lacks, or whose commit is a docs pin that changes only version literals (scripts/pin-only.mjs);
// - is committed by anyone but those two or GitHub (noreply@github.com, which commits the merge
//   queue's squash commits and the web editor's);
// - carries AI attribution in its message: a `*-by:` trailer (Co-authored-by, Assisted-by, ...)
//   naming an AI tool or any [bot] but release.yml's, a "generated with/by" line naming an AI tool, or the robot
//   emoji's "Generated with" footer. Every match ignores case.
//
// It never passes a range it could not read: a missing or unknown commit, or an empty range, fails.
//
// On a pull request CI also sets PR_TITLE and PR_BODY: GitHub copies the co-author trailers a cloud session's
// commit signer forces onto branch commits into the squash commit unless the merge passes its own message (gh ouro-pr
// does, and so does Desk's merge-when-green relay), so the commits' authors and committers are judged, their
// messages only for the co-author lines the repository's "No AI co-author credit" ruleset refuses, and the pull request's title and body in full, as the message that lands. The merge queue's squash
// commits, and any run without PR_TITLE, are judged in full.
//
//   node scripts/attribution.mjs <base> <head>   checks the commits in base..head
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pinProblems } from "./pin-only.mjs";

/** The only person who commits to this repository. */
export const MAINTAINER = { name: "Ari Mendelow", email: "16390116+arimendelow@users.noreply.github.com" };
/** release.yml's identity: it authors and commits the pull request that prepares main after a release. */
export const RELEASE_BOT = "41898282+github-actions[bot]@users.noreply.github.com";
/** GitHub, which commits the merge queue's squash commits. */
export const GITHUB = "noreply@github.com";
/** Dependabot: it authors dependency-bump commits, and only those. */
export const DEPENDABOT = "49699333+dependabot[bot]@users.noreply.github.com";
/** The only trailer a bot may carry besides release.yml's: Dependabot's own sign-off. */
export const DEPENDABOT_TRAILER = "dependabot[bot] <support@github.com>";
/** The credit GitHub's squash adds for Dependabot, the author of a bump pull request's commits. */
export const DEPENDABOT_CREDIT = `dependabot[bot] <${DEPENDABOT}>`;
/** What a Dependabot commit may change: manifests, the lockfile and the workflows and actions it pins. */
export const DEPENDENCY_FILES = /^(?:package\.json|pnpm-lock\.yaml|\.github\/(?:workflows|actions)\/.+)$/;
export const AUTHORS = [MAINTAINER.email, RELEASE_BOT, DEPENDABOT];
/** The project's own app, Ouro Current: it authors the revert pull requests screen-reader-revert.yml opens, and only those. */
export const OURO_CURRENT = "357084126+ouro-current[bot]@users.noreply.github.com";
/** A revert's subject as GitHub writes it, for a commit and for its squash: `Revert "<the reverted pull request's title>"`. */
export const REVERT_SUBJECT = /^Revert "/;
/** The trailer GitHub adds to the squash of a pull request release.yml opened: no AI, so the one bot a trailer may name. */
export const RELEASE_BOT_TRAILER = `github-actions[bot] <${RELEASE_BOT}>`;
/** The credit GitHub's squash adds for the project's own app, whose merge-of-main and pin commits the check already limits. */
export const OURO_CURRENT_CREDIT = `ouro-current[bot] <${OURO_CURRENT}>`;
export const COMMITTERS = [MAINTAINER.email, RELEASE_BOT, GITHUB];

const tools = "copilot|claude|anthropic|openai|chatgpt|gpt|codex|gemini|cursor|devin|aider";
/** An AI tool's name as a word of its own (`copilot-swe-agent`, `198982749+Copilot@…`, `noreply@anthropic.com`), or any bot. */
const AI_OR_BOT = new RegExp(String.raw`(?<![a-z0-9])(?:${tools})(?![a-z])|\[bot\]`, "i");
/** A named AI tool anywhere after "generated with/by", or AI itself right after it ("Generated by an AI"). */
const AI_TOOL = new RegExp(String.raw`(?<![a-z0-9])(?:${tools})(?![a-z])|^\s+(?:an?\s+)?(?:ai|llm)(?![a-z])`, "i");
/** A trailer, also as the squash message bullets a one-line commit message (`* Co-authored-by: …`). */
const TRAILER = /^[\s*>-]*([a-z][a-z-]*-by)\s*:\s*(.+)$/i;
/** Every line terminator, so no separator hides a trailer from the checks that read a line. */
const LINE_TERMINATOR = /\r\n|[\n\r\u2028\u2029\u0085]/;
/** Characters that draw nothing (zero-width spaces and joiners, soft hyphens, byte order marks, variation selectors, fillers, the blank braille cell): a way to split a name the checks look for. */
const INVISIBLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}\u2800]|(?![\t\n\r])\p{Cc}/gu;
/** A hidden character may sit inside a word or stand between words, so a line is read with them removed and with them as spaces. */
const FILLER = INVISIBLE;
/** The "No AI co-author credit" ruleset's pattern for a commit message, as the ruleset writes it. */
const RULESET_CREDIT = /co-authored-by:[^\n]*(copilot|claude|anthropic|openai|chatgpt|codex|gemini|cursor|devin)/i;
const GENERATED = /(?<![a-z])generated\s+(?:with|by)(?![a-z])(.*)$/i;
const ROBOT_FOOTER = /🤖.*(?<![a-z])generated(?![a-z])/iu;

const identity = `GIT_AUTHOR_NAME="${MAINTAINER.name}" GIT_AUTHOR_EMAIL=${MAINTAINER.email} GIT_COMMITTER_NAME="${MAINTAINER.name}" GIT_COMMITTER_EMAIL=${MAINTAINER.email}`;
/** How to re-author a pull request's commits as the maintainer. */
export const REAUTHOR = `re-author the pull request's commits: ${identity} git rebase origin/main --exec 'git commit --amend --no-edit --reset-author', then git push --force-with-lease.`;
/** How to drop a line from a pull request's commit messages. */
export const REWORD = `remove the line from the pull request's commit messages: git rebase -i origin/main, mark each commit that has it "reword" and delete the line, then git push --force-with-lease.`;
/** How to drop a credit: GitHub also writes one into the squash for every commit author other than the pull request's. */
export const UNCREDIT = `remove the line from the pull request's commit messages (git rebase -i origin/main, "reword"), and re-author its commits, since the squash credits every other commit author: ${identity} git rebase origin/main --exec 'git commit --amend --no-edit --reset-author'; then git push --force-with-lease.`;

/**
 * The problems with these commits (`{ sha, authorName, authorEmail, committerName, committerEmail, message }`),
 * each `{ sha, field, problem, fix }`.
 */
export function problems(commits, { messages = true } = {}) {
  const found = [];
  for (const commit of commits) {
    const report = (field, problem, fix) => found.push({ sha: commit.sha, field, problem, fix });
    const dependabot = commit.authorEmail.toLowerCase() === DEPENDABOT;
    const files = commit.files ?? [];
    const bump = dependabot && files.length > 0 && files.every((file) => DEPENDENCY_FILES.test(file));
    const stray = files.filter((file) => !DEPENDENCY_FILES.test(file));
    if (dependabot && (files.length === 0 || stray.length > 0)) report("files", files.length === 0 ? "Dependabot's commit changes no file the check could read" : `Dependabot may change only dependency files (package.json, pnpm-lock.yaml, workflows and actions), not ${stray.join(", ")}`, REAUTHOR);
    const current = commit.authorEmail.toLowerCase() === OURO_CURRENT;
    const revert = current && REVERT_SUBJECT.test(commit.message);
    const mainMerge = current && (commit.mainMerge === true || commit.pinOnly === true);
    if (!AUTHORS.includes(commit.authorEmail.toLowerCase()) && !revert && !mainMerge) report("author", `${commit.authorName} <${commit.authorEmail}> may not author here (only ${AUTHORS.join(" or ")}, or ${OURO_CURRENT} for a revert a merge of main that adds nothing main lacks, or a pin that changes only version literals)`, REAUTHOR);
    if (!COMMITTERS.includes(commit.committerEmail.toLowerCase()) && !(mainMerge && commit.committerEmail.toLowerCase() === OURO_CURRENT)) report("committer", `${commit.committerName} <${commit.committerEmail}> may not commit here (only ${COMMITTERS.join(", ")})`, REAUTHOR);
    // A line is read with its hidden characters removed and as spaces. NEL is a line terminator and a hidden character at once, so a message is read split at it and, when it holds one, again whole.
    const read = (raw, field) => {
      for (const line of [raw.replace(INVISIBLE, ""), raw.replace(FILLER, " ").replace(INVISIBLE, "")]) {
        const trailer = line.match(TRAILER);
        const own = (bump && trailer?.[1].toLowerCase() === "co-authored-by" && trailer[2].trim().toLowerCase() === DEPENDABOT_CREDIT) || (trailer && [RELEASE_BOT_TRAILER, DEPENDABOT_TRAILER, OURO_CURRENT_CREDIT].includes(trailer[2].trim().toLowerCase()));
        if (trailer && !own && AI_OR_BOT.test(trailer[2])) return report(field, `"${raw.trim()}" credits an AI tool or a bot`, UNCREDIT);
        const generated = line.match(GENERATED);
        if ((generated && AI_TOOL.test(generated[1])) || ROBOT_FOOTER.test(line)) return report(field, `"${raw.trim()}" says an AI tool wrote it`, REWORD);
      }
    };
    if (!messages) {
      // The repository's "No AI co-author credit" ruleset refuses these lines in a branch commit whatever lands in the squash.
      commit.message.split(LINE_TERMINATOR).forEach((raw, index) => {
        if (RULESET_CREDIT.test(raw)) report(`message line ${index + 1}`, `"${raw.trim()}" credits an AI tool or a bot, which the "No AI co-author credit" ruleset refuses`, UNCREDIT);
      });
      continue;
    }
    const before = found.length;
    commit.message.split(LINE_TERMINATOR).forEach((raw, index) => read(raw, `message line ${index + 1}`));
    if (found.length === before && commit.message.includes("\u0085")) commit.message.split(/\r\n|[\n\r\u2028\u2029]/).forEach((raw, index) => read(raw, `message line ${index + 1}`));
  }
  return found;
}

const runGit = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });

/** How many times the log is tried: the checkout is a partial clone, so reading the trees a log lists fetches them from the remote, and one dropped connection must not fail the job. */
export const LOG_TRIES = 3;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Whether a commit only merges the base into a branch: two parents, the second an ancestor of the base, and a tree equal to the clean merge of its parents. Any git failure says no. */
export function isMainMerge(sha, base, git = runGit) {
  try {
    const parents = git(["rev-list", "--parents", "-n", "1", sha]).trim().split(/\s+/).slice(1);
    if (parents.length !== 2) return false;
    git(["merge-base", "--is-ancestor", parents[1], base]);
    const merged = git(["merge-tree", "--write-tree", parents[0], parents[1]]).split("\n")[0].trim();
    return merged !== "" && merged === git(["rev-parse", `${sha}^{tree}`]).trim();
  } catch {
    return false;
  }
}

/** Whether a commit is a docs pin: one parent, and a diff scripts/pin-only.mjs accepts, which changes only version literals. Any git failure says no. */
export function isPinCommit(sha, git = runGit) {
  try {
    const parents = git(["rev-list", "--parents", "-n", "1", sha]).trim().split(/\s+/).slice(1);
    if (parents.length !== 1) return false;
    const at = (rev, path) => {
      try {
        return git(["show", `${rev}:${path}`]);
      } catch {
        return null;
      }
    };
    const paths = git(["diff", "--no-renames", "--name-only", "-z", parents[0], sha]).split("\0").filter(Boolean);
    return paths.length > 0 && pinProblems(paths.map((path) => ({ path, before: at(parents[0], path), after: at(sha, path) }))).length === 0;
  } catch {
    return false;
  }
}

/** The commits in base..head, newest first. Throws when either end is missing or unknown, or the range is empty. */
export function readCommits(base, head, git = runGit, pause = sleep) {
  for (const [end, ref] of [["base", base], ["head", head]]) {
    if (!ref) throw new Error(`no ${end} commit was given, so the range cannot be read.`);
    try {
      git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    } catch {
      throw new Error(`the ${end} commit ${ref} is not in this checkout, so the range cannot be read: fetch it (CI checks out with fetch-depth: 0).`);
    }
  }
  // A failed read is tried again: each try fetches what the last one did not finish, and the last failure is the one thrown.
  let log;
  for (let attempt = 1; ; attempt++) {
    try {
      log = git(["-c", "log.showSignature=false", "log", "--name-only", "--format=%x1e%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1f", `${base}..${head}`]);
      break;
    } catch (error) {
      if (attempt >= LOG_TRIES) throw error;
      pause(attempt * 5000);
    }
  }
  const commits = log
    .split("\x1e")
    .map((record) => record.replace(/^\n/, ""))
    .filter(Boolean)
    .map((record) => {
      const [sha, authorName, authorEmail, committerName, committerEmail, message, names] = record.split("\x1f");
      return { sha, authorName, authorEmail, committerName, committerEmail, message: message.trimEnd(), files: names.split("\n").filter(Boolean) };
    });
  if (commits.length === 0) throw new Error(`${base}..${head} holds no commits, so there is nothing that could pass.`);
  for (const commit of commits) if (commit.authorEmail.toLowerCase() === OURO_CURRENT) {
    commit.mainMerge = isMainMerge(commit.sha, base, git);
    commit.pinOnly = isPinCommit(commit.sha, git);
  }
  return commits;
}

/** The pull request's title and body, judged as the one message that lands when the merge passes its own. */
export const textProblems = (title, body) =>
  problems([{ sha: "pull request", authorName: MAINTAINER.name, authorEmail: MAINTAINER.email, committerName: MAINTAINER.name, committerEmail: MAINTAINER.email, message: `${title}\n\n${body}` }]).map((found) => ({
    ...found,
    fix: "edit the pull request's title or body to remove the line, then merge with gh ouro-pr, which passes them as the commit message",
  }));

/** Checks base..head, printing each problem; returns the exit status. */
export function main([base, head] = [], { git = runGit, log = console.log, actions = Boolean(process.env.GITHUB_ACTIONS), env = process.env, pause = sleep } = {}) {
  const prefix = actions ? "::error::" : "";
  let commits;
  try {
    commits = readCommits(base, head, git, pause);
  } catch (error) {
    log(`${prefix}attribution: ${error.message}`);
    return 1;
  }
  const text = env.PR_TITLE !== undefined;
  const found = problems(commits, { messages: !text });
  if (text) found.push(...textProblems(env.PR_TITLE, env.PR_BODY ?? ""));
  for (const { sha, field, problem, fix } of found) log(`${prefix}attribution: commit ${sha.slice(0, 12)}, ${field}: ${problem}. Fix: ${fix}`);
  if (found.length === 0) log(`attribution: ${base}..${head} holds ${commits.length} commit${commits.length === 1 ? "" : "s"}, with no AI attribution, all written by the maintainer, release.yml, Dependabot (dependency files only) or GitHub.`);
  return found.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
