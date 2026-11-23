// Size checks that judge a pull request by its own growth. Each size check (the pages' JavaScript closures in
// site/e2e/catalog.spec.ts, the page patterns in scripts/pattern-size.test.mjs) measures its sizes, writes them to
// .tmp/size/<check>.json, and CI uploads that file as the artifact size-<check>-<tree>, named for the git tree it measured:
// a tree measures the same every time, and a push to main that passes by proof (scripts/ci-proof.mjs) has its tree
// measured by the run that proved it.
//
// On a pull request or in the merge queue, CI first fetches the report of the commit it merges into (the merge commit's
// first parent) to .tmp/size/base-<check>.json. When main's run on that commit has not uploaded its report yet (it is still
// running, or measured nothing), the base is the nearest commit before it on main's first-parent history that has one,
// up to LOOKBACK commits back, and each size's line names that commit and says the growth includes the commits between. A size then fails only when this change grew it by more than its budget
// (or by more than that plus what the change raised its ceiling by). A size over its ceiling that the base was over too is
// reported, not failed: it is main's to fix, and size-ceilings.yml, after CI on main, opens or updates the issue "A size is over its ceiling on
// main". With no base measurement within LOOKBACK commits, the ceiling decides, as it does on a run by hand.
//
// A pull request whose base was still under a ceiling, but whose own (budget-sized) growth carries it past that ceiling,
// is a tip: the pull request named in the `tips` array, which a caller logs as a `::warning::` annotation on the job, so
// the pull request that first crosses a ceiling is found without failing it. Report-only while this is new; once it has
// run quiet for a while it is meant to fail the pull request instead, the same way growth over budget already does.
//
//   node scripts/size-gate.mjs base <check>   fetch the base commit's report (CI, on a pull request or in the merge queue)
//   node scripts/size-gate.mjs main <check>…  list the sizes over their ceilings in this commit's tree (CI, on main)
import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** Where the size checks write their reports, and where CI puts the base's. */
export const reportDir = join(repo, ".tmp/size");

/** The artifact a size check's report is uploaded as, for the tree it measured. */
export const reportName = (check, tree) => `size-${check}-${tree}`;

/**
 * How a run judges its sizes: `pull` on a pull request or in the merge queue (by growth over the base), `main` on a push
 * to main (never failing: main's size job reports a breach), and `local` otherwise (by the ceiling).
 */
export function gateMode(env = process.env) {
  if (env.SIZE_GATE === "pull" || env.SIZE_GATE === "main") return env.SIZE_GATE;
  return "local";
}

/** How many commits of main's first-parent history the base step looks through for a report. */
export const LOOKBACK = 20;

/**
 * The base's report for a check, written by `size-gate.mjs base`, or null when CI found none. When it was measured at an
 * earlier commit than the one this merges into, its `origin` (not enumerable, so not a size) is `{ commit, behind }`.
 */
export function readBase(check, dir = reportDir) {
  const file = join(dir, `base-${check}.json`);
  if (!existsSync(file)) return null;
  const base = JSON.parse(readFileSync(file, "utf8"));
  const origin = join(dir, `base-${check}.origin.json`);
  if (existsSync(origin)) Object.defineProperty(base, "origin", { value: JSON.parse(readFileSync(origin, "utf8")), enumerable: false });
  return base;
}

/** Writes a check's report: each size's name, its bytes, its ceiling and the most a pull request may add to it. */
export function writeReport(check, sizes, dir = reportDir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${check}.json`), `${JSON.stringify(sizes, null, 2)}\n`);
}

/** The sizes over their ceilings. */
export function mainBreaches(sizes) {
  return Object.entries(sizes)
    .filter(([, size]) => size.bytes > size.ceiling)
    .map(([name, size]) => `${name}: ${size.bytes} bytes, over its ceiling of ${size.ceiling}`);
}

/**
 * Judges a run's sizes. Each size is `{ bytes, ceiling, budget }`; `base` is the base commit's report, or null when
 * there is none. Returns `ok`, the failures, a tip for a size whose base was under its ceiling and this change carries
 * past it (report-only; see the file's header), and a line for every size for the job's log.
 */
export function judgeSizes(sizes, { mode, base }) {
  const lines = [];
  const failures = [];
  const tips = [];
  for (const [name, size] of Object.entries(sizes)) {
    const over = size.bytes > size.ceiling;
    const was = mode === "pull" ? base?.[name] : undefined;
    if (mode === "pull" && was) {
      const grew = size.bytes - was.bytes;
      const allowed = size.budget + Math.max(0, size.ceiling - was.ceiling);
      const behind = base.origin?.behind > 0 ? base.origin : null;
      const where = behind ? ` (measured at ${behind.commit.slice(0, 7)}, ${behind.behind} commit${behind.behind === 1 ? "" : "s"} before the commit this merges into; the growth includes theirs)` : "";
      const growth = `${grew >= 0 ? `${grew} more` : `${-grew} less`} than its base's ${was.bytes}${where}`;
      if (grew > allowed) {
        failures.push(`${name}: ${size.bytes} bytes, ${growth}, over the ${allowed} a pull request may add. Make it smaller, or raise its ceiling with the new measurement and why`);
        lines.push(failures.at(-1));
      } else if (over && was.bytes <= was.ceiling) {
        const tip = `${name}: ${size.bytes} bytes, ${growth}, within the ${allowed} a pull request may add, but past its ceiling of ${size.ceiling} for the first time: this pull request tips it over. Raise the ceiling with the new measurement and why, or make it smaller`;
        tips.push(tip);
        lines.push(tip);
      } else {
        lines.push(`${name}: ${size.bytes} bytes, ${growth}, within the ${allowed} a pull request may add${over ? `; over its ceiling of ${size.ceiling} (main's own size check reports a ceiling main is over)` : `, under its ceiling of ${size.ceiling}`}`);
      }
      continue;
    }
    const line = `${name}: ${size.bytes} bytes, ${over ? "over" : "under"} its ceiling of ${size.ceiling}${mode === "pull" ? " (no measurement of the base commit to compare with)" : ""}`;
    lines.push(line);
    if (over && mode !== "main") failures.push(line);
  }
  return { ok: failures.length === 0, failures, lines, tips };
}

/**
 * The one file in a zip as GitHub serves an artifact (stored or deflated), as text. Its sizes are read from the central
 * directory at the end, since a zip written as a stream records none in the file's own header.
 */
export function readZipEntry(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end === -1) throw new Error("not a zip file");
  const central = zip.readUInt32LE(end + 16);
  if (zip.readUInt32LE(central) !== 0x02014b50) throw new Error("a zip without its central directory");
  const method = zip.readUInt16LE(central + 10);
  const size = zip.readUInt32LE(central + 20);
  const local = zip.readUInt32LE(central + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  if (method === 0) return data.toString("utf8");
  if (method === 8) return inflateRawSync(data).toString("utf8");
  throw new Error(`zip compression method ${method} is not read here`);
}

/** Asks GitHub's REST API for JSON. */
async function rest(fetch, url, token) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/** A commit's tree and its first parent's sha (null for a root commit). */
async function commitOf({ fetch, api, repo, token }, sha) {
  const commit = await (await rest(fetch, `${api}/repos/${repo}/commits/${sha}`, token)).json();
  return { tree: commit.commit.tree.sha, parent: commit.parents?.[0]?.sha ?? null };
}

/** The tree a commit records. */
async function treeOf(gh, sha) {
  return (await commitOf(gh, sha)).tree;
}

/** The newest unexpired artifact with that name, as `{ report, artifact }`, or null. */
async function newestReport({ fetch, api, repo, token }, name) {
  const { artifacts } = await (await rest(fetch, `${api}/repos/${repo}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=20`, token)).json();
  const live = artifacts.filter((artifact) => !artifact.expired).toSorted((a, b) => b.created_at.localeCompare(a.created_at));
  if (live.length === 0) return null;
  const zip = Buffer.from(await (await rest(fetch, `${api}/repos/${repo}/actions/artifacts/${live[0].id}/zip`, token)).arrayBuffer());
  return { report: JSON.parse(readZipEntry(zip)), artifact: live[0].id };
}

/**
 * The report of the commit `sha` merges into (its first parent): that commit's tree's newest artifact for the check, or
 * else the nearest one along main's first-parent history before it, up to LOOKBACK commits in all. Returns
 * `{ report, from, artifact, commit, behind }`, where `behind` counts the commits between, or `{ report: null, why }`.
 */
export async function baseReport({ check, sha, repo, api, token, fetch = globalThis.fetch }) {
  const gh = { fetch, api, repo, token };
  try {
    let commit = (await commitOf(gh, sha)).parent;
    if (!commit) return { report: null, why: `${sha} has no parent to compare with` };
    let first;
    for (let behind = 0; commit && behind < LOOKBACK; behind += 1) {
      const { tree, parent } = await commitOf(gh, commit);
      const name = reportName(check, tree);
      first ??= name;
      const found = await newestReport(gh, name);
      if (found) return { report: found.report, from: name, artifact: found.artifact, commit, behind };
      commit = parent;
    }
    return { report: null, why: `no artifact named ${first}, nor for the ${LOOKBACK - 1} commits before it on main: their runs did not measure it, or the artifacts expired` };
  } catch (error) {
    return { report: null, why: String(error.message ?? error) };
  }
}

/** Each check's breaches in a commit's tree, from its reports: `{ breaches, missing }`. */
export async function treeBreaches({ checks, sha, repo, api, token, fetch = globalThis.fetch }) {
  const gh = { fetch, api, repo, token };
  const tree = await treeOf(gh, sha);
  const breaches = [];
  const missing = [];
  for (const check of checks) {
    const found = await newestReport(gh, reportName(check, tree));
    if (found) breaches.push(...mainBreaches(found.report));
    else missing.push(reportName(check, tree));
  }
  return { breaches, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...checks] = process.argv.slice(2);
  const github = { repo: process.env.GITHUB_REPOSITORY, api: process.env.GITHUB_API_URL ?? "https://api.github.com", token: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN, sha: process.env.SIZE_SHA || process.env.GITHUB_SHA };
  if (command === "base") {
    // Never fails the job: without a base, the size check falls back to its ceilings and says so.
    for (const check of checks) {
      const found = await baseReport({ check, ...github });
      if (found.report) {
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(join(reportDir, `base-${check}.json`), `${JSON.stringify(found.report, null, 2)}\n`);
        writeFileSync(join(reportDir, `base-${check}.origin.json`), `${JSON.stringify({ commit: found.commit, behind: found.behind })}\n`);
        const earlier = found.behind > 0 ? `, measured at ${found.commit}, ${found.behind} commit${found.behind === 1 ? "" : "s"} before the commit this merges into, which has no report yet: the growth includes the commits between` : "";
        console.log(`${check}: the base's sizes, from artifact ${found.from} (${found.artifact})${earlier}`);
      } else {
        console.log(`::notice title=No base sizes for ${check}::${found.why}. Its sizes are judged by their ceilings.`);
      }
    }
  } else if (command === "main") {
    const { breaches, missing } = await treeBreaches({ checks, ...github });
    for (const name of missing) console.log(`::notice title=No sizes measured::no artifact named ${name}: the run that measured this tree uploaded none, so its ceilings are not checked here.`);
    for (const breach of breaches) console.log(`::error title=Size over its ceiling on main::${breach}`);
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `breaches=${breaches.join("; ")}\n`, { flag: "a" });
  } else {
    console.error("usage: node scripts/size-gate.mjs base <check>… | main <check>…");
    process.exit(2);
  }
}
