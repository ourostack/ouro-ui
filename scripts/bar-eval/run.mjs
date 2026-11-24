// The bar evaluation: fresh agents get a request a person would make, in a fresh checkout of a product that uses Ouro
// UI, with nothing about the bar in the prompt; a fresh judge on another model reads each answer against criteria
// written before any run, and says pass or fail per criterion, never a score. Scenarios: scenarios.json.
//
//   node scripts/bar-eval/run.mjs --phase baseline --out <folder outside the repository> \
//     --repo spoonjoy=<a clone of spoonjoy/spoonjoy-v2> [--scenarios <another product's scenarios.json> --repo <name>=<clone>]
//
// Each run gets a new worktree at its repository's origin/main, a new COPILOT_HOME (no hooks, plugins or memory), the
// stored Copilot sign-in rather than any token in the environment, and read-only tools. The out folder gets one folder
// per run (prompt, transcript, answer, verdict), then results.json and results.md. --publish <folder> writes the
// evidence to commit: the tables, and each run's prompt, calls, answer and verdict, except for a --private repository's
// runs, whose code is not public: those keep only their scenario, model and verdict per criterion.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({
  options: {
    phase: { type: "string" },
    out: { type: "string" },
    repo: { type: "string", multiple: true, default: [] },
    // <name>=<ref>: run that repository at a ref of the local clone instead of origin/main, such as main with a change
    // that hasn't merged yet applied on top.
    ref: { type: "string", multiple: true, default: [] },
    scenarios: { type: "string", multiple: true, default: [join(here, "scenarios.json")] },
    models: { type: "string", default: "claude-sonnet-5.5,gpt-6.2-sol" },
    judge: { type: "string", default: "claude-opus-5.5" },
    reps: { type: "string", default: "2" },
    only: { type: "string" },
    concurrency: { type: "string", default: "5" },
    // Read the runs already in --out and judge any without a verdict, instead of running agents again.
    "judge-only": { type: "boolean", default: false },
    publish: { type: "string" },
    private: { type: "string", default: "" },
  },
});
if (!values.phase || !values.out) {
  console.error("bar-eval: --phase and --out are required. Fix: node scripts/bar-eval/run.mjs --phase baseline --out ../bar-eval/baseline --repo spoonjoy=<clone>");
  process.exit(2);
}

const files = values.scenarios.map((file) => JSON.parse(readFileSync(resolve(file), "utf8")));
const { suffix } = files[0];
const all = files.flatMap((file) => file.scenarios);
const scenarios = values.only ? all.filter((s) => values.only.split(",").includes(s.id)) : all;
const repos = Object.fromEntries(values.repo.map((pair) => pair.split("=")).map(([name, path]) => [name, resolve(path)]));
const refs = Object.fromEntries(values.ref.map((pair) => pair.split("=")));
const models = values.models.split(",");
const out = resolve(values.out);
mkdirSync(out, { recursive: true });

const READ_ONLY_SHELL = ["ls", "cat", "head", "tail", "wc", "find", "rg", "grep", "sed", "git log", "git show", "git grep", "git ls-files"];
const cleanEnv = (home) => {
  const env = { ...process.env, COPILOT_HOME: home, COPILOT_AUTO_UPDATE: "false" };
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "COPILOT_GITHUB_TOKEN"]) delete env[name];
  return env;
};

function copilot(args, { cwd, home, timeoutMs }) {
  return new Promise((done) => {
    const child = spawn("copilot", args, { cwd, env: cleanEnv(home), stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => done({ code, stdout, stderr }));
  });
}

/** The events worth keeping from Copilot's JSONL: the prompt, each tool call, and each message the agent wrote. */
function transcript(jsonl) {
  const events = [];
  for (const line of jsonl.split("\n")) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === "tool.execution_start") events.push({ tool: event.data.toolName, arguments: event.data.arguments });
    if (event.type === "assistant.message" && event.data.content) events.push({ message: event.data.content });
  }
  return events;
}

async function runOne(scenario, model, rep, commits) {
  const id = `${scenario.id}--${model}--${rep}`;
  const dir = join(out, id);
  const checkout = join(dir, "repo");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "home"), { recursive: true });
  const source = repos[scenario.repo];
  execFileSync("git", ["-C", source, "worktree", "add", "-q", "--detach", checkout, commits[scenario.repo]]);
  const prompt = `${scenario.prompt}\n\n${suffix}`;
  const started = Date.now();
  const result = await copilot(
    ["-p", prompt, "--model", model, "--available-tools", "view", "grep", "glob", "web_fetch", "bash",
      "--allow-tool", ...READ_ONLY_SHELL.map((cmd) => `shell(${cmd})`), "--allow-all-urls",
      "--no-ask-user", "--disable-builtin-mcps", "--output-format", "json"],
    { cwd: checkout, home: join(dir, "home"), timeoutMs: 20 * 60_000 },
  );
  execFileSync("git", ["-C", source, "worktree", "remove", "--force", checkout]);
  rmSync(join(dir, "home"), { recursive: true, force: true });
  const events = transcript(result.stdout);
  const answer = events.filter((event) => event.message).at(-1)?.message ?? "";
  const record = { id, scenario: scenario.id, repo: scenario.repo, commit: commits[scenario.repo], model, rep, exit: result.code, seconds: Math.round((Date.now() - started) / 1000), prompt, events };
  writeFileSync(join(dir, "run.json"), JSON.stringify(record, null, 2));
  writeFileSync(join(dir, "answer.md"), answer);
  if (!answer) writeFileSync(join(dir, "stderr.txt"), result.stderr);
  return record;
}

function judgePrompt(scenario, answer) {
  return [
    "You are an independent judge. An agent working in a product's repository got the request below and wrote the answer below. Judge the answer against each criterion, and nothing else: not its length, style or what you would have done.",
    "A criterion is met only when the answer clearly does what it says. Quote the answer's own words as evidence; if nothing in the answer meets it, say so.",
    "",
    `Context about the product: ${scenario.judgeContext}`,
    "",
    "The request:",
    scenario.prompt,
    "",
    "The criteria:",
    ...scenario.criteria.map((c) => `- ${c.id}: ${c.text}`),
    "",
    "The answer, between the markers:",
    "<<<ANSWER",
    answer,
    "ANSWER>>>",
    "",
    'Reply with one JSON object and nothing else: {"criteria":[{"id":"<id>","met":true|false,"evidence":"<quote or what is missing>"}],"summary":"<one sentence>"}',
  ].join("\n");
}

async function judge(record, scenario) {
  const dir = join(out, record.id);
  if (existsSync(join(dir, "verdict.json"))) return JSON.parse(readFileSync(join(dir, "verdict.json"), "utf8"));
  const answer = readFileSync(join(dir, "answer.md"), "utf8");
  if (!answer) return { criteria: [], pass: false, summary: "No answer: the run ended without one." };
  let verdict;
  // A reply that is not JSON is asked for again once, from a fresh judge.
  for (let attempt = 0; attempt < 2 && !verdict?.criteria?.length; attempt++) {
    mkdirSync(join(dir, "judge-home"), { recursive: true });
    const result = await copilot(
      ["-p", judgePrompt(scenario, answer), "--model", values.judge, "--available-tools", "view", "--no-ask-user", "--disable-builtin-mcps", "-s"],
      { cwd: dir, home: join(dir, "judge-home"), timeoutMs: 10 * 60_000 },
    );
    rmSync(join(dir, "judge-home"), { recursive: true, force: true });
    try {
      verdict = JSON.parse(result.stdout.slice(result.stdout.indexOf("{"), result.stdout.lastIndexOf("}") + 1));
    } catch {
      verdict = { criteria: [], summary: `The judge's reply was not JSON: ${result.stdout.slice(0, 200)}` };
    }
  }
  const ids = scenario.criteria.map((c) => c.id);
  verdict.pass = ids.every((cid) => verdict.criteria.some((c) => c.id === cid && c.met === true));
  writeFileSync(join(dir, "verdict.json"), JSON.stringify(verdict, null, 2));
  return verdict;
}

async function pool(items, limit, work) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

const jobs = scenarios.flatMap((scenario) => models.flatMap((model) => Array.from({ length: Number(values.reps) }, (_, i) => ({ scenario, model, rep: i + 1 }))));
let records;
if (values["judge-only"]) {
  records = jobs.map(({ scenario, model, rep }) => JSON.parse(readFileSync(join(out, `${scenario.id}--${model}--${rep}`, "run.json"), "utf8")));
} else {
  const commits = {};
  for (const name of new Set(scenarios.map((s) => s.repo))) {
    if (!refs[name]) execFileSync("git", ["-C", repos[name], "fetch", "-q", "origin", "main"]);
    commits[name] = execFileSync("git", ["-C", repos[name], "rev-parse", refs[name] ?? "origin/main"], { encoding: "utf8" }).trim();
  }
  records = await pool(jobs, Number(values.concurrency), async ({ scenario, model, rep }) => {
    const record = await runOne(scenario, model, rep, commits);
    console.log(`ran ${record.id} in ${record.seconds}s`);
    return record;
  });
}
const verdicts = await pool(records, Number(values.concurrency), (record) => judge(record, scenarios.find((s) => s.id === record.scenario)));

const rows = records.map((record, i) => ({ id: record.id, scenario: record.scenario, model: record.model, rep: record.rep, commit: record.commit, seconds: record.seconds, calls: record.events.filter((e) => e.tool).length, pass: verdicts[i].pass, criteria: Object.fromEntries((verdicts[i].criteria ?? []).map((c) => [c.id, c.met])) }));
writeFileSync(join(out, "results.json"), JSON.stringify({ phase: values.phase, judge: values.judge, models, rows }, null, 2));
const table = [
  `# The bar evaluation: ${values.phase}`,
  "",
  `Judge: ${values.judge}. A run passes when the judge finds every criterion met.`,
  "",
  `| Scenario | ${models.join(" | ")} |`,
  `|---|${models.map(() => "---").join("|")}|`,
  ...scenarios.map((s) => `| ${s.id}${s.counter ? " (counter)" : ""} | ${models.map((m) => { const mine = rows.filter((r) => r.scenario === s.id && r.model === m); return `${mine.filter((r) => r.pass).length}/${mine.length}`; }).join(" | ")} |`),
  "",
  "| Run | Pass | Criteria met | Missed |",
  "|---|---|---|---|",
  ...rows.map((r) => `| ${r.id} | ${r.pass ? "yes" : "no"} | ${Object.entries(r.criteria).filter(([, met]) => met).map(([id]) => id).join(", ")} | ${Object.entries(r.criteria).filter(([, met]) => !met).map(([id]) => id).join(", ")} |`),
  "",
].join("\n");
writeFileSync(join(out, "results.md"), table);
console.log(table);

if (values.publish) {
  const hidden = new Set(values.private.split(",").filter(Boolean));
  const dest = resolve(values.publish);
  mkdirSync(join(dest, "runs"), { recursive: true });
  writeFileSync(join(dest, "results.txt"), table);
  const shown = rows.map((row) => (hidden.has(records.find((r) => r.id === row.id).repo) ? { ...row, commit: undefined } : row));
  writeFileSync(join(dest, "results.json"), `${JSON.stringify({ phase: values.phase, judge: values.judge, models, rows: shown }, null, 2)}\n`);
  records.forEach((record, i) => {
    if (hidden.has(record.repo)) return;
    const answer = readFileSync(join(out, record.id, "answer.md"), "utf8");
    const text = JSON.stringify({ ...record, answer, verdict: verdicts[i] }, null, 2).replaceAll(join(out, record.id, "repo"), ".");
    writeFileSync(join(dest, "runs", `${record.id}.json`), `${text}\n`);
  });
}
