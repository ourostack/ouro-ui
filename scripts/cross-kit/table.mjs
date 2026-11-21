import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const kits = [
  { kit: "web", repo: "ourostack/ouro-ui", dir: "test/fixtures/a2ui/cases", job: /^ci$/i, logJob: /^scripts/ },
  { kit: "apple", repo: "ourostack/ouro-ui-apple", dir: "Tests/OuroA2UITests/Conformance/cases", job: /^Build, test, DocC and gallery/ },
  { kit: "windows", repo: "ourostack/ouro-ui-windows", dir: "vendor/core/a2ui/conformance/cases", job: /^actions$/ },
  { kit: "android", repo: "ourostack/ouro-ui-android", dir: "vendor/core/composed/cases", job: /^build$/ },
];

export const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function sameCases(coreDir, kitDir) {
  const core = new Map(readdirSync(coreDir).filter((f) => f.endsWith(".json")).map((f) => [f, hash(join(coreDir, f))]));
  const kit = new Map(readdirSync(kitDir).filter((f) => f.endsWith(".json")).map((f) => [f, hash(join(kitDir, f))]));
  const differing = [...core.keys()].filter((f) => kit.get(f) !== core.get(f));
  return { cases: core.size, same: core.size - differing.length, differing };
}

/** Each kit's CI log names every core case and its result; the readers below turn a log into Map(case file -> "pass" | "FAIL"). */
const readers = {
  web: (log) => [...log.matchAll(/(✔|✖) core case (\S+\.json) resolves to its expect/g)].map((m) => [m[2], m[1] === "✔"]),
  windows: (log) => [...log.matchAll(/\b(Passed|Failed) Ouro\.Tests\.A2UITests\.Each_case_resolves_to_its_expect\(name: "([^"]+\.json)"\)/g)].map((m) => [m[2], m[1] === "Passed"]),
  apple: (log) => [...log.matchAll(/(◇|✘) Test case passing 1 argument name → "([^"]+\.json)" to resolvesToExpect\(_:\) (started|failed)/g)].map((m) => [m[2], m[3] === "started"]),
  android: (log) => [...log.matchAll(/\| (\S+\.json) \| (pass|FAIL) \|/g)].map((m) => [m[1], m[2] === "pass"]),
};

export function parseCases(kit, log) {
  const out = new Map();
  for (const [name, passed] of readers[kit](log)) out.set(name, (out.get(name) ?? true) && passed);
  return out;
}

/** Component spec cases: Android's log names each as `| <spec>/<case id> | pass |`, Windows' as `Passed Ouro.Claims.Each_spec_case_holds(name: "<spec>/<case id>")`; the other kits name none, so their columns are "-". */
const componentReaders = {
  android: (log) => [...log.matchAll(/\| ([a-z][a-z-]*\/[a-z][a-z0-9-]*) \| (pass|FAIL) \|/g)].map((m) => [m[1], m[2] === "pass"]),
  windows: (log) => [...log.matchAll(/\b(Passed|Failed) Ouro\.Claims\.Each_spec_case_holds\(name: "([^"]+)"\)/g)].map((m) => [m[2], m[1] === "Passed"]),
};
const componentJobs = { android: /^build$/, windows: /^windows$/ };

export function parseComponentCases(kit, log) {
  const out = new Map();
  for (const [name, passed] of componentReaders[kit](log)) out.set(name, (out.get(name) ?? true) && passed);
  return out;
}

/** One row per core case, one column per kit: pass, FAIL, or "-" where that kit's log names no such case. */
export function caseTable(caseNames, results) {
  const names = Object.keys(results);
  return ["| Case | " + names.join(" | ") + " |", "|---|" + names.map(() => "---|").join(""),
    ...caseNames.map((c) => `| ${c} | ` + names.map((k) => (results[k].has(c) ? (results[k].get(c) ? "pass" : "FAIL") : "-")).join(" | ") + " |")].join("\n");
}

export function componentCaseNames(coreRoot, specs) {
  return specs.flatMap((spec) => JSON.parse(readFileSync(join(coreRoot, "standard/hx/components", `${spec}.spec.json`), "utf8")).cases.map((c) => `${spec}/${c.id}`));
}

const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));

function latestMain(repo, job) {
  try {
    return readLatest(repo, job);
  } catch {
    return { result: "unknown", url: "", sha: "" };
  }
}

function readLatest(repo, job) {
  const runs = gh("run", "list", "-R", repo, "-b", "main", "-w", "CI", "-L", "10", "--json", "databaseId,conclusion,headSha,url");
  for (const run of runs) {
    if (!run.conclusion || run.conclusion === "skipped") continue;
    const jobs = gh("run", "view", String(run.databaseId), "-R", repo, "--json", "jobs").jobs;
    const found = jobs.find((j) => job.test(j.name));
    if (found) return { result: found.conclusion, url: run.url, sha: run.headSha.slice(0, 7) };
  }
  return { result: "unknown", url: "", sha: "" };
}

function latestCases(k) {
  const merged = new Map();
  try {
    const runs = gh("run", "list", "-R", k.repo, "-b", "main", "-w", "CI", "-L", "10", "--json", "databaseId,conclusion");
    const run = runs.find((r) => r.conclusion && r.conclusion !== "skipped" && parseJobs(k, r.databaseId, merged));
    return run ? merged : new Map();
  } catch {
    return new Map();
  }
}

function latestComponentCases(k) {
  const job = componentJobs[k.kit];
  try {
    const runs = gh("run", "list", "-R", k.repo, "-b", "main", "-w", "CI", "-L", "10", "--json", "databaseId,conclusion");
    for (const run of runs.filter((r) => r.conclusion && r.conclusion !== "skipped")) {
      const found = gh("run", "view", String(run.databaseId), "-R", k.repo, "--json", "jobs").jobs.find((j) => job.test(j.name));
      const cases = found ? parseComponentCases(k.kit, jobLog(k.repo, found.databaseId)) : new Map();
      if (cases.size > 0) return cases;
    }
  } catch {
    /* a kit with no readable log shows a dash */
  }
  return new Map();
}

function jobLog(repo, id) {
  for (let attempt = 0; ; attempt++) {
    try {
      return execFileSync("gh", ["run", "view", "--job", String(id), "-R", repo, "--log"], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}

function parseJobs(k, runId, merged) {
  const jobs = gh("run", "view", String(runId), "-R", k.repo, "--json", "jobs").jobs;
  for (const j of jobs.filter((j) => (k.logJob ?? k.job).test(j.name))) {
    const log = jobLog(k.repo, j.databaseId);
    for (const [name, passed] of parseCases(k.kit, log)) merged.set(name, (merged.get(name) ?? true) && passed);
  }
  return merged.size > 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [coreRoot, ...roots] = process.argv.slice(2);
  const coreDir = join(coreRoot, "standard/hx/a2ui/conformance/cases");
  const rows = kits.map((k, i) => ({ kit: k.kit, ...sameCases(coreDir, join(roots[i], k.dir)), ...latestMain(k.repo, k.job) }));
  const table = ["| Kit | Cases identical to core | Latest main CI job running them | Commit |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.kit} | ${r.same}/${r.cases} | [${r.result}](${r.url}) | ${r.sha} |`)].join("\n");
  console.log(table);
  const results = {};
  for (const k of kits) results[k.kit] = latestCases(k);
  console.log("\n" + caseTable(readdirSync(coreDir).filter((f) => f.endsWith(".json")).sort(), results));
  const componentResults = {};
  for (const k of kits.filter((k) => k.kit in componentJobs)) componentResults[k.kit] = latestComponentCases(k);
  console.log("\n" + caseTable(componentCaseNames(coreRoot, ["tabs", "tab-bar", "sidebar", "checkbox", "text-field", "switch", "select", "field", "message", "reaction-bar", "message-list", "composer"]), componentResults));
}
