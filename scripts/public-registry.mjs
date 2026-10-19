// Qualifies the @ouro namespace, the registry Pages serves at /r/ (scripts/namespace.sh builds
// it from a release tag), against the release's own source, so what an app installs through
// `@ouro/<item>` is that release's code, byte for byte. Neither mode counts items itself: the
// counts come from the commit's registry.json.
//
//   node scripts/public-registry.mjs verify-build <namespace-dir> <commit>
//
// checks a built namespace folder against <commit> (in this checkout): every item in the
// commit's registry.json has <namespace-dir>/<item>.json and no other item file is there; each
// item equals the commit's entry, with every same-repo registry dependency pointed at
// @ouro/<item> as namespace.sh rewrites it, and each listed file's content equals the commit's
// file at its path byte for byte; and the folder's registry.json is the commit's registry with
// those dependencies. release.yml runs it on the release commit before it tags.
//
//   node scripts/public-registry.mjs verify-live <tag> [--wait <seconds>]
//
// builds the namespace from <tag> into a temporary folder (namespace.sh), checks that build as
// verify-build does, then fetches https://<owner>.github.io/<repo>/r/<item>.json for every item
// and the index, and requires each to equal the local build byte for byte, and the served index
// to list no other item. With --wait it keeps trying for that long while the deploy is stale,
// because Pages and its cache take minutes to show a deploy. release.yml runs it last, after
// published-release.mjs. Each problem is a GitHub ::error:: line naming the item; exit 1.
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const ITEM_SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";
const INDEX = "registry.json";

/** A registry dependency as the namespace serves it: a same-repo one (pinned to a tag or not) becomes @ouro/<item>. */
export function namespaceDependency(dependency, repo) {
  const prefix = `${repo}/`;
  return dependency.startsWith(prefix) ? `@ouro/${dependency.slice(prefix.length).replace(/#.*$/, "")}` : dependency;
}

const withNamespaceDependencies = (item, repo) =>
  item.registryDependencies ? { ...item, registryDependencies: item.registryDependencies.map((dep) => namespaceDependency(dep, repo)) } : item;

const shown = (value) => {
  const text = JSON.stringify(value);
  return text === undefined || text.length <= 160 ? text : `${text.slice(0, 160)}…`;
};

/** The first way `actual` differs from `expected`, as "<path> ...", or undefined when they are equal. */
function difference(expected, actual, path, ref) {
  const at = (key) => (path === "" ? key : typeof key === "number" ? `${path}[${key}]` : `${path}.${key}`);
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path} has ${actual.length} entries, not ${expected.length}`;
    for (const [index, value] of expected.entries()) {
      const found = difference(value, actual[index], at(index), ref);
      if (found) return found;
    }
    return undefined;
  }
  const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
  if (isObject(expected) && isObject(actual)) {
    for (const key of Object.keys(expected)) {
      if (!(key in actual)) return `${at(key)} is missing`;
      const found = difference(expected[key], actual[key], at(key), ref);
      if (found) return found;
    }
    const extra = Object.keys(actual).find((key) => !(key in expected));
    return extra === undefined ? undefined : `${at(extra)} is not in ${ref}'s registry.json`;
  }
  if (JSON.stringify(expected) === JSON.stringify(actual)) return undefined;
  if (typeof expected === "string" && typeof actual === "string" && (shown(expected) !== JSON.stringify(expected) || shown(actual) !== JSON.stringify(actual))) {
    // Long strings: show where they part, not two identical truncated starts.
    let at = 0;
    while (at < expected.length && expected[at] === actual[at]) at += 1;
    const around = (text) => `${at > 40 ? "…" : ""}${shown(text.slice(Math.max(0, at - 40)))}`;
    return `${path} differs from character ${at}: ${around(actual)}, not ${around(expected)}`;
  }
  return `${path} is ${shown(actual)}, not ${shown(expected)}`;
}

const parse = (bytes) => {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return undefined;
  }
};

/**
 * Why a built namespace (`namespace`: file name to bytes) is not `registry` (the commit's
 * registry.json, parsed) with its files read by `readSource(path)` (bytes, or undefined when
 * the commit has no such file), one line per problem, each starting with the item's name; none
 * when it is. `ref` names the commit in the messages.
 */
export function buildProblems({ registry, readSource, namespace, repo, ref }) {
  const problems = [];
  const names = new Set(registry.items.map((item) => item.name));
  for (const item of registry.items) {
    const file = `${item.name}.json`;
    if (!namespace.has(file)) {
      problems.push(`${item.name}: ${file} is missing from the namespace.`);
      continue;
    }
    const built = parse(namespace.get(file));
    if (built === undefined) {
      problems.push(`${item.name}: ${file} is not JSON.`);
      continue;
    }
    const { $schema, ...actual } = built;
    if ($schema !== ITEM_SCHEMA) problems.push(`${item.name}: $schema is ${$schema === undefined ? "missing" : `${shown($schema)}, not ${shown(ITEM_SCHEMA)}`}.`);
    // shadcn's build may write an item with no files with `files: []` or without the key.
    const files = actual.files ?? [];
    for (const [index, entry] of files.entries()) {
      const path = entry?.path;
      if (typeof path !== "string" || !path.startsWith("registry/") || path.split("/").includes("..")) {
        problems.push(`${item.name}: ${path} is not a file under registry/.`);
        continue;
      }
      if (typeof entry.content !== "string") {
        problems.push(`${item.name}: files[${index}].content is missing.`);
        continue;
      }
      const source = readSource(path);
      if (source === undefined) problems.push(`${item.name}: ${path} is not in ${ref}.`);
      else if (!Buffer.from(entry.content, "utf8").equals(source)) problems.push(`${item.name}: ${path} differs from ${ref}'s file.`);
    }
    const expected = withNamespaceDependencies({ ...item, files: item.files ?? [] }, repo);
    const metadata = { ...actual, files: files.map((entry) => (typeof entry === "object" && entry !== null ? Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "content")) : entry)) };
    const found = difference(expected, metadata, "", ref);
    if (found) problems.push(`${item.name}: ${found}.`);
  }
  for (const file of [...namespace.keys()].sort()) {
    if (file === INDEX) continue;
    const name = file.replace(/\.json$/, "");
    if (!file.endsWith(".json") || !names.has(name)) problems.push(`${name}: ${file} is in the namespace but not in ${ref}'s registry.json.`);
  }
  if (!namespace.has(INDEX)) problems.push(`${INDEX} is missing from the namespace.`);
  else {
    const index = parse(namespace.get(INDEX));
    const expected = { ...registry, items: registry.items.map((item) => withNamespaceDependencies(item, repo)) };
    const found = index === undefined ? "is not JSON" : difference(expected, index, "", ref);
    if (found) problems.push(`${INDEX}: ${found}.`);
  }
  return problems;
}

const label = (file) => (file === INDEX ? INDEX : file.replace(/\.json$/, ""));

/**
 * Why the deploy, read through `fetchFile(name)` (resolving to `{ status, body }`), does not
 * serve the local build `local` (file name to bytes) of `tag` byte for byte, one line per
 * problem, each starting with the item's name; none when it does.
 */
export async function liveProblems(local, fetchFile, tag) {
  const files = [...local.keys()];
  const served = new Map();
  let next = 0;
  // Eight requests at a time: every item, without hammering Pages.
  await Promise.all(
    Array.from({ length: Math.min(8, files.length) }, async () => {
      while (next < files.length) {
        const file = files[next++];
        try {
          served.set(file, await fetchFile(file));
        } catch (error) {
          served.set(file, { error: error.message });
        }
      }
    }),
  );
  const problems = [];
  for (const file of files) {
    const response = served.get(file);
    if (response.error !== undefined) problems.push(`${label(file)}: ${file} could not be fetched (${response.error}).`);
    else if (response.status !== 200) problems.push(`${label(file)}: ${file} is not served (HTTP ${response.status}).`);
    else if (!response.body.equals(local.get(file))) {
      const index = file === INDEX ? parse(response.body) : undefined;
      const version = parse(local.get(INDEX) ?? Buffer.from(""))?.version;
      if (index?.version !== undefined && index.version !== version) problems.push(`${INDEX}: the deploy serves the index of v${index.version}, not ${tag}.`);
      else problems.push(`${label(file)}: the served ${file} differs from the ${tag} build.`);
    }
  }
  const index = served.get(INDEX);
  const items = index?.status === 200 ? parse(index.body)?.items : undefined;
  for (const item of Array.isArray(items) ? items : []) {
    if (!local.has(`${item?.name}.json`)) problems.push(`${item?.name}: the deploy serves ${item?.name}, which the ${tag} build does not have.`);
  }
  return problems;
}

/** liveProblems, again every `intervalMs` while there are any and `waitMs` has not passed. */
export async function waitForLive({ local, tag, fetchFile, waitMs, intervalMs = 20_000, now = Date.now, sleep: pause = sleep, log = console.log }) {
  const deadline = now() + waitMs;
  let problems = await liveProblems(local, fetchFile, tag);
  while (problems.length > 0 && now() < deadline) {
    log(`The deploy does not serve the ${tag} build yet (${problems.length} problem${problems.length === 1 ? "" : "s"}, first: ${problems[0]}); trying again in ${intervalMs / 1000} s.`);
    await pause(intervalMs);
    problems = await liveProblems(local, fetchFile, tag);
  }
  return problems;
}

/** Every file in a built namespace folder, by name. */
function readNamespace(dir) {
  return new Map(readdirSync(dir).sort().map((file) => [file, readFileSync(join(dir, file))]));
}

/** The commit's file at each path, read in one `git cat-file --batch`; undefined for a path it lacks. */
function readCommitFiles(sha, paths) {
  const out = execFileSync("git", ["cat-file", "--batch"], { input: paths.map((path) => `${sha}:${path}\n`).join(""), maxBuffer: 1024 * 1024 * 1024 });
  const files = new Map();
  let at = 0;
  for (const path of paths) {
    const end = out.indexOf(10, at);
    const header = out.subarray(at, end).toString("utf8");
    at = end + 1;
    const [, type, size] = header.split(" ");
    if (type !== "blob") continue; // "<object> missing"
    files.set(path, out.subarray(at, at + Number(size)));
    at += Number(size) + 1;
  }
  return files;
}

/** verify-build: the problems with `dir` as a namespace built from `commit`, and what it counted. */
function verifyBuild(dir, commit, repo) {
  const sha = execFileSync("git", ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`], { encoding: "utf8" }).trim();
  const ref = sha.slice(0, 12);
  const registry = JSON.parse(execFileSync("git", ["show", `${sha}:${INDEX}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  const paths = [...new Set(registry.items.flatMap((item) => (item.files ?? []).map((file) => file.path)))];
  const sources = readCommitFiles(sha, paths);
  const namespace = readNamespace(dir);
  const problems = buildProblems({ registry, readSource: (path) => sources.get(path), namespace, repo, ref });
  const files = registry.items.reduce((count, item) => count + (item.files?.length ?? 0), 0);
  return { problems, namespace, ref, summary: `${registry.items.length} items, ${files} files and its index` };
}

function report(problems) {
  const shownProblems = problems.slice(0, 50);
  for (const problem of shownProblems) console.log(`::error::${problem}`);
  if (problems.length > shownProblems.length) console.log(`::error::And ${problems.length - shownProblems.length} more problems.`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  const repo = process.env.GITHUB_REPOSITORY ?? "ourostack/ouro-ui";
  if (command === "verify-build") {
    const [dir, commit] = args;
    if (!dir || !commit) throw new Error("usage: public-registry.mjs verify-build <namespace-dir> <commit>");
    const { problems, ref, summary } = verifyBuild(resolve(dir), commit, repo);
    if (problems.length > 0) report(problems);
    else console.log(`The namespace in ${resolve(dir)} matches ${ref} byte for byte: ${summary}.`);
  } else if (command === "verify-live") {
    const [tag, flag, seconds] = args;
    if (!/^v\d+\.\d+\.\d+$/.test(tag ?? "")) throw new Error("usage: public-registry.mjs verify-live v<x.y.z> [--wait <seconds>]");
    const waitMs = flag === "--wait" ? Number(seconds) * 1000 : 0;
    if (!Number.isFinite(waitMs) || waitMs < 0 || (flag !== undefined && flag !== "--wait")) throw new Error("--wait takes a number of seconds.");
    const work = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "ouro-live-"));
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    try {
      execFileSync(join(root, "scripts/namespace.sh"), [join(work, "ns"), tag, join(work, "src")], { stdio: "pipe" });
    } catch (error) {
      process.stderr.write(`${error.stdout ?? ""}${error.stderr ?? ""}`);
      throw error;
    }
    const build = verifyBuild(join(work, "ns"), `refs/tags/${tag}`, repo);
    if (build.problems.length > 0) {
      console.log(`The namespace built from ${tag} does not match the tag:`);
      report(build.problems);
    } else {
      const [owner, name] = repo.split("/");
      const base = `https://${owner}.github.io/${name}/r/`;
      // A query string the cache has not seen, so Pages serves the newest deploy.
      const fetchFile = async (file) => {
        const response = await globalThis.fetch(`${base}${file}?t=${Date.now()}`);
        return { status: response.status, body: Buffer.from(await response.arrayBuffer()) };
      };
      const problems = await waitForLive({ local: build.namespace, tag, fetchFile, waitMs });
      if (problems.length > 0) {
        console.log(`${base} does not serve the ${tag} build. Pages builds the namespace from GitHub's newest release (pages.yml); run it on main once the release is out.`);
        report(problems);
      } else console.log(`${base} serves the ${tag} build byte for byte: ${build.summary}.`);
    }
  } else {
    throw new Error("usage: public-registry.mjs verify-build <namespace-dir> <commit> | verify-live v<x.y.z> [--wait <seconds>]");
  }
}
