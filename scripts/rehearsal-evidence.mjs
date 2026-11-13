// The release rehearsal (release-rehearsal.yml) that holds for main's commit T, which release.yml
// is about to release: the newest rehearsal of the version on T itself, or, when T has none, the
// newest one on a commit R of main at most MAX_COMMITS commits before T, started at most
// MAX_AGE_HOURS ago, from which T differs only in files that ship nowhere: tests and docs no
// install, release note, release commit, site or namespace reads (`reusable`). So merges of tests
// and docs can go on while a rehearsal runs and after it passes, and anything else (a component, a
// script, a workflow, configuration, dependencies, a change fragment) needs a rehearsal of its own.
// The release itself still runs the full CI and the screen-reader lane on its own release commit
// before it tags; this only decides whether the rehearsal before it still holds.
//
// Any error, a git or gh call that fails or an answer it cannot read, refuses the rehearsal. git
// runs in the current folder, release.yml's checkout of T; a shallow checkout is first deepened by
// MAX_COMMITS commits (--deepen, which never shortens the history it has), and a full one is left alone.
//
//   node scripts/rehearsal-evidence.mjs <tag> <sha> [--notes <file>] [--runs <file>]
//   node scripts/rehearsal-evidence.mjs pick <tag> <main's head> [--runs <file>]
//
// `pick` prints the commit release.yml cuts the release from (releaseCommit): the commit a
// passing rehearsal tested, which need not be main's head.
//
// Prints the rehearsal run's id on stdout, and what it found on stderr; with GITHUB_STEP_SUMMARY set,
// writes the run and, for an earlier commit, every file T changes to the step summary, and with
// --notes the same for the release notes, the files capped at NOTES_FILES. --runs reads the
// rehearsal runs from a file of `gh run list --json` output instead of asking GitHub (a dry run).
// Fails with ::error:: on stderr when no rehearsal holds.
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { syncedFiles } from "./latest-release.mjs";

/** How old a rehearsal on an earlier commit may be, from its start. */
export const MAX_AGE_HOURS = 24;
/** How many commits before T a rehearsal on an earlier commit may be. */
export const MAX_COMMITS = 50;
/** How many of the files T changes the release notes list; the step summary lists them all. */
export const NOTES_FILES = 30;
/** How many of the newest rehearsal runs are read. */
export const RUN_LIMIT = 200;

/** Paths that ship or feed what ships, whatever their name: each denies, with why. */
const denied = [
  [/^registry\//, "registry/ ships: every file in it is an item's file, its tests, stories and specs included (the <name>-tests items)"],
  [/^registry\.json$/, "registry.json is the registry"],
  [/^changes\//, "change fragments are the release notes (CHANGES.md)"],
  [/^\.github\//, "workflows and repository settings run the release and its checks"],
  [/^test\/install-fixture[^/]*\//, "the install fixtures are what the install test, and the release-only install-latest job, install into"],
];

/** Paths that ship nowhere: tests, test data and hand-written records. */
const allowed = [
  [/^test\//, "the shared test suites and their data (test/)"],
  [/^site\/e2e\//, "the site's end-to-end specs and their evidence (site/e2e/)"],
  [/(^|\/)__tests__\//, "a test folder"],
  [/(^|\/)__screenshots__\//, "screenshot baselines"],
  [/\.test\.[cm]?[jt]sx?$/, "a test file"],
  [/^docs\/decisions\//, "a decision record or its evidence, which no page, item or note includes (docs/decisions/)"],
  [/^AGENTS\.md$/, "the contributors' guide, which nothing installs or publishes"],
];

/**
 * Whether a release may reuse a rehearsal across a change to `path`: `{ ok, why }`. It may only
 * when nothing an installed app, the release notes, the release commit, the site or the `@ouro`
 * namespace is made from can change with it. `shipped` holds the files registry.json's items name
 * (at either commit), which never pass whatever their name.
 */
export function reusable(path, shipped = new Set()) {
  if (shipped.has(path)) return { ok: false, why: "an item in registry.json ships it" };
  if (syncedFiles.includes(path)) return { ok: false, why: "the release commit writes the release's tag into it (scripts/latest-release.mjs syncedFiles)" };
  for (const [pattern, why] of denied) if (pattern.test(path)) return { ok: false, why };
  for (const [pattern, why] of allowed) if (pattern.test(path)) return { ok: true, why };
  return { ok: false, why: "not a test or a record that ships nowhere: it may change what an install, the site or the release receives" };
}

/** The files registry.json's items name, read from the given registry.json text. */
export function shippedFiles(registryJson) {
  const { items } = JSON.parse(registryJson);
  if (!Array.isArray(items)) throw new Error("registry.json has no items");
  return items.flatMap((item) => (item.files ?? []).map((file) => file.path)).filter((path) => typeof path === "string");
}

const hexSha = /^[0-9a-f]{40}$/;

/** `git <args>` in `cwd`: `{ status, stdout, stderr }`. */
export const runGit = (cwd) => (args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? result.error?.message ?? "" };
};

/** `git <args>`'s output, or an error naming the call. */
function must(git, args) {
  const result = git(args);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

/**
 * The rehearsal that holds for `sha`, of `tag`'s rehearsal runs (`gh run list --json
 * databaseId,status,conclusion,displayTitle,headSha,createdAt`): `{ ok: true, run, rehearsed,
 * commits, files }` (`files` each `{ path, why }`, empty with `rehearsed` = `sha`), or `{ ok: false,
 * reason }`. Throws on a git call that fails.
 */
export function findEvidence({ tag, sha, runs, git, now = Date.now(), maxAgeHours = MAX_AGE_HOURS, maxCommits = MAX_COMMITS }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) return { ok: false, reason: `"${tag}" is not a tag such as v1.2.3` };
  if (!hexSha.test(sha ?? "")) return { ok: false, reason: `"${sha}" is not a full commit SHA` };
  if (!Array.isArray(runs)) return { ok: false, reason: "the rehearsal runs are not a list" };
  const title = `Release rehearsal ${tag}`;
  const ofTag = runs.filter((run) => run?.displayTitle === title);
  const unreadable = ofTag.find((run) => !Number.isSafeInteger(run.databaseId) || !hexSha.test(run.headSha ?? ""));
  if (unreadable) return { ok: false, reason: `a rehearsal run of ${tag} has no readable id or commit: ${JSON.stringify(unreadable)}` };
  const newest = (list) => list.reduce((a, b) => (b.databaseId > a.databaseId ? b : a));
  const passed = (run) => run.status === "completed" && run.conclusion === "success";
  const state = (run) => (run.status === "completed" ? run.conclusion || "no conclusion" : run.status || "not finished");

  // A rehearsal on T itself decides, as it always has: the newest one must have passed.
  const onCommit = ofTag.filter((run) => run.headSha === sha);
  if (onCommit.length > 0) {
    const run = newest(onCommit);
    if (!passed(run)) return { ok: false, reason: `the newest rehearsal of ${tag} on main (${sha}), run ${run.databaseId}, is '${state(run)}', not success` };
    return { ok: true, run, rehearsed: sha, commits: 0, files: [] };
  }

  // Else the newest rehearsal on a commit of main up to maxCommits before T decides; a shallow
  // checkout is deepened by that much first, and a commit it then does not hold is further back.
  if (ofTag.length === 0) return { ok: false, reason: `no rehearsal of ${tag} has run` };
  if (must(git, ["rev-parse", "--is-shallow-repository"]).trim() === "true") must(git, ["fetch", "--no-tags", "--quiet", `--deepen=${maxCommits}`, "origin", sha]);
  const before = [];
  for (const run of ofTag) {
    if (git(["cat-file", "-e", `${run.headSha}^{commit}`]).status !== 0) continue;
    const ancestor = git(["merge-base", "--is-ancestor", run.headSha, sha]);
    if (ancestor.status === 1) continue;
    if (ancestor.status !== 0) throw new Error(`git merge-base --is-ancestor ${run.headSha} ${sha} failed: ${ancestor.stderr.trim()}`);
    const commits = Number(must(git, ["rev-list", "--count", `${run.headSha}..${sha}`]).trim());
    if (!Number.isSafeInteger(commits)) throw new Error(`git rev-list --count ${run.headSha}..${sha} gave no count`);
    if (commits <= maxCommits) before.push({ run, commits });
  }
  if (before.length === 0) return { ok: false, reason: `no rehearsal of ${tag} ran on main (${sha}) or on a commit of main up to ${maxCommits} commits before it` };
  const { run, commits } = before.reduce((a, b) => (b.run.databaseId > a.run.databaseId ? b : a));
  const rehearsed = run.headSha;
  if (!passed(run)) return { ok: false, reason: `the newest rehearsal of ${tag} before main (${sha}), run ${run.databaseId} on ${rehearsed}, is '${state(run)}', not success` };
  const age = (now - Date.parse(run.createdAt)) / 3_600_000;
  if (!(age >= 0 && age <= maxAgeHours)) return { ok: false, reason: `the rehearsal of ${tag} on ${rehearsed}, run ${run.databaseId}, started ${Number.isFinite(age) ? `${age.toFixed(1)} hours ago` : `at an unreadable time (${run.createdAt})`}, over the ${maxAgeHours} hours a rehearsal on an earlier commit holds for` };

  const shipped = new Set([...shippedFiles(must(git, ["show", `${rehearsed}:registry.json`])), ...shippedFiles(must(git, ["show", `${sha}:registry.json`]))]);
  const paths = must(git, ["diff", "--name-only", "--no-renames", "-z", rehearsed, sha]).split("\0").filter(Boolean);
  const files = paths.map((path) => ({ path, ...reusable(path, shipped) }));
  const refused = files.filter((file) => !file.ok);
  if (refused.length > 0) {
    const listed = refused.slice(0, 20).map(({ path, why }) => `${path} (${why})`).join("; ");
    return { ok: false, reason: `main (${sha}) differs from ${rehearsed}, where run ${run.databaseId} rehearsed ${tag}, in ${refused.length} file(s) that may ship: ${listed}${refused.length > 20 ? `; and ${refused.length - 20} more` : ""}` };
  }
  return { ok: true, run, rehearsed, commits, files: files.map(({ path, why }) => ({ path, why })) };
}

/**
 * The commit release.yml cuts `tag` from, given main's head `head`: `head` itself when the newest
 * rehearsal of `tag` there passed, else the newest commit of main at most `maxCommits` before it
 * whose newest rehearsal of `tag` passed and started at most `maxAgeHours` ago. So merges to main
 * while a rehearsal runs never make it stale: the release is the commit it tested, and the later
 * merges go out in the next release. `{ ok: true, run, sha }` or `{ ok: false, reason }`. Throws on
 * a git call that fails; a shallow checkout is first deepened by `maxCommits` commits.
 */
export function releaseCommit({ tag, head, runs, git, now = Date.now(), maxAgeHours = MAX_AGE_HOURS, maxCommits = MAX_COMMITS }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) return { ok: false, reason: `"${tag}" is not a tag such as v1.2.3` };
  if (!hexSha.test(head ?? "")) return { ok: false, reason: `"${head}" is not a full commit SHA` };
  if (!Array.isArray(runs)) return { ok: false, reason: "the rehearsal runs are not a list" };
  const ofTag = runs.filter((run) => run?.displayTitle === `Release rehearsal ${tag}`);
  const unreadable = ofTag.find((run) => !Number.isSafeInteger(run.databaseId) || !hexSha.test(run.headSha ?? ""));
  if (unreadable) return { ok: false, reason: `a rehearsal run of ${tag} has no readable id or commit: ${JSON.stringify(unreadable)}` };
  // The newest rehearsal on each commit decides for that commit, as findEvidence has it.
  const newestOn = new Map();
  for (const run of ofTag) if (!(newestOn.get(run.headSha)?.databaseId > run.databaseId)) newestOn.set(run.headSha, run);
  const passed = [...newestOn.values()].filter((run) => run.status === "completed" && run.conclusion === "success").sort((a, b) => b.databaseId - a.databaseId);
  if (passed.length === 0) return { ok: false, reason: `no commit's newest rehearsal of ${tag} passed` };
  const onHead = passed.find((run) => run.headSha === head);
  if (onHead) return { ok: true, run: onHead, sha: head };

  if (must(git, ["rev-parse", "--is-shallow-repository"]).trim() === "true") must(git, ["fetch", "--no-tags", "--quiet", `--deepen=${maxCommits}`, "origin", head]);
  for (const run of passed) {
    const age = (now - Date.parse(run.createdAt)) / 3_600_000;
    if (!(age >= 0 && age <= maxAgeHours)) continue;
    if (git(["cat-file", "-e", `${run.headSha}^{commit}`]).status !== 0) continue;
    const ancestor = git(["merge-base", "--is-ancestor", run.headSha, head]);
    if (ancestor.status === 1) continue;
    if (ancestor.status !== 0) throw new Error(`git merge-base --is-ancestor ${run.headSha} ${head} failed: ${ancestor.stderr.trim()}`);
    const commits = Number(must(git, ["rev-list", "--count", `${run.headSha}..${head}`]).trim());
    if (!Number.isSafeInteger(commits)) throw new Error(`git rev-list --count ${run.headSha}..${head} gave no count`);
    if (commits <= maxCommits) return { ok: true, run, sha: run.headSha };
  }
  return { ok: false, reason: `no passing rehearsal of ${tag} is on main (${head}) or on a commit of main up to ${maxCommits} commits before it, started in the last ${maxAgeHours} hours` };
}

/** The step summary's and the release notes' account of `evidence`: `{ summary, notes }`. */
export function describe(evidence, { sha, tag, server, repo }) {
  const { run, rehearsed, commits, files } = evidence;
  const runUrl = `${server}/${repo}/actions/runs/${run.databaseId}`;
  if (rehearsed === sha) {
    const line = `Rehearsed: [the rehearsal of ${tag}](${runUrl}) passed on main's commit \`${sha}\`, which this release is cut from.\n`;
    return { summary: line, notes: line };
  }
  const compare = `${server}/${repo}/compare/${rehearsed}...${sha}`;
  const head = `Rehearsed: [the rehearsal of ${tag}](${runUrl}) passed on main's commit \`${rehearsed}\`, ${commits} commit(s) before \`${sha}\`, which this release is cut from. They differ only in ${files.length} file(s) that ship nowhere, tests and records (scripts/rehearsal-evidence.mjs), so the rehearsal holds for it ([the diff](${compare})):\n\n`;
  const item = ({ path, why }) => `- \`${path}\`: ${why}\n`;
  const shown = files.slice(0, NOTES_FILES).map(item).join("");
  const more = files.length > NOTES_FILES ? `- and ${files.length - NOTES_FILES} more, in the diff\n` : "";
  return { summary: head + files.map(item).join(""), notes: head + shown + more };
}

/** The rehearsal runs of the last RUN_LIMIT, from GitHub or from `file`. */
function readRuns(file) {
  const fields = "databaseId,status,conclusion,displayTitle,headSha,createdAt";
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const result = spawnSync("gh", ["run", "list", "--workflow", "release-rehearsal.yml", "--limit", String(RUN_LIMIT), "--json", fields], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`gh run list failed: ${(result.stderr ?? result.error?.message ?? "").trim()}`);
  return JSON.parse(result.stdout);
}

export function main(args, { env = process.env, cwd = process.cwd(), now = Date.now(), log = (line) => process.stderr.write(`${line}\n`), out = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const option = (name) => {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = args[index + 1];
    args.splice(index, 2);
    return value ?? "";
  };
  try {
    if (args[0] === "pick") {
      const runsFile = option("--runs");
      if (runsFile === "" || args.length !== 3) throw new Error("usage: rehearsal-evidence.mjs pick <tag> <head> [--runs <file>]");
      const [, tag, head] = args;
      const picked = releaseCommit({ tag, head, runs: readRuns(runsFile), git: runGit(cwd), now });
      if (!picked.ok) {
        log(`::error::No commit to release ${tag} from: ${picked.reason}. Rehearse main's head: gh workflow run release-rehearsal.yml -f version=${tag.slice(1)}`);
        return 1;
      }
      log(`Releasing ${tag} from ${picked.sha}, the commit rehearsal run ${picked.run.databaseId} tested${picked.sha === head ? " (main's head)" : `; main's head is ${head}`}.`);
      out(picked.sha);
      return 0;
    }
    const notes = option("--notes");
    const runsFile = option("--runs");
    if (notes === "" || runsFile === "" || args.length !== 2) throw new Error("usage: rehearsal-evidence.mjs <tag> <sha> [--notes <file>] [--runs <file>]");
    const [tag, sha] = args;
    const repo = env["GITHUB_REPOSITORY"];
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error("GITHUB_REPOSITORY must name the repository (owner/name)");
    const server = env["GITHUB_SERVER_URL"] ?? "https://github.com";
    const evidence = findEvidence({ tag, sha, runs: readRuns(runsFile), git: runGit(cwd), now });
    if (!evidence.ok) {
      log(`::error::No rehearsal holds for ${tag} on main (${sha}): ${evidence.reason}. Rehearse main's head: gh workflow run release-rehearsal.yml -f version=${tag.slice(1)}`);
      return 1;
    }
    const { summary, notes: noteText } = describe(evidence, { sha, tag, server, repo });
    if (env["GITHUB_STEP_SUMMARY"]) appendFileSync(env["GITHUB_STEP_SUMMARY"], summary);
    if (notes !== undefined) writeFileSync(notes, noteText);
    log(summary.trimEnd());
    out(String(evidence.run.databaseId));
    return 0;
  } catch (error) {
    log(`::error::Could not tell whether a rehearsal holds: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
