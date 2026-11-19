import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const kits = [
  { kit: "web", repo: "ourostack/ouro-ui", dir: "test/fixtures/a2ui/cases", job: /^ci$/i },
  { kit: "apple", repo: "ourostack/ouro-ui-apple", dir: "Tests/OuroA2UITests/Conformance/cases", job: /^Build, test, DocC and gallery/ },
  { kit: "windows", repo: "ourostack/ouro-ui-windows", dir: "vendor/core/a2ui/conformance/cases", job: /^windows$/ },
  { kit: "android", repo: "ourostack/ouro-ui-android", dir: "vendor/core/composed/cases", job: /^build$/ },
];

export const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

export function sameCases(coreDir, kitDir) {
  const core = new Map(readdirSync(coreDir).filter((f) => f.endsWith(".json")).map((f) => [f, hash(join(coreDir, f))]));
  const kit = new Map(readdirSync(kitDir).filter((f) => f.endsWith(".json")).map((f) => [f, hash(join(kitDir, f))]));
  const differing = [...core.keys()].filter((f) => kit.get(f) !== core.get(f));
  return { cases: core.size, same: core.size - differing.length, differing };
}

const gh = (...args) => JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));

function latestMain(repo, job) {
  const runs = gh("run", "list", "-R", repo, "-b", "main", "-w", "CI", "-L", "10", "--json", "databaseId,conclusion,headSha,url");
  for (const run of runs) {
    if (!run.conclusion || run.conclusion === "skipped") continue;
    const jobs = gh("run", "view", String(run.databaseId), "-R", repo, "--json", "jobs").jobs;
    const found = jobs.find((j) => job.test(j.name));
    if (found) return { result: found.conclusion, url: run.url, sha: run.headSha.slice(0, 7) };
  }
  return { result: "unknown", url: "", sha: "" };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [coreRoot, ...roots] = process.argv.slice(2);
  const coreDir = join(coreRoot, "standard/hx/a2ui/conformance/cases");
  const rows = kits.map((k, i) => ({ kit: k.kit, ...sameCases(coreDir, join(roots[i], k.dir)), ...latestMain(k.repo, k.job) }));
  const table = ["| Kit | Cases identical to core | Latest main CI job running them | Commit |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.kit} | ${r.same}/${r.cases} | [${r.result}](${r.url}) | ${r.sha} |`)].join("\n");
  writeFileSync("scripts/cross-kit/table.md", table + "\n");
  console.log(table);
}
