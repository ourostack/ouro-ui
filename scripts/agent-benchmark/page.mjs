// Renders the site's agent interface page (docs/guides/agent-interfaces.md, served at /docs/agent-interfaces/) from
// the published runs' results.json files. Every number on the page comes from them; nothing is written by hand.
// pnpm claims:check renders it again and fails when the committed page differs.
//
//   node scripts/agent-benchmark/page.mjs docs/guides/agent-interfaces.md
//   node scripts/agent-benchmark/page.mjs <out.md> <folder of run folders>    # a page from unpublished runs, as CI does
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarize } from "./run.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = "https://github.com/ourostack/ouro-ui";
export const RESULTS_DIR = path.join(here, "results");

const ARM_NAMES = {
  "action-model": "Ouro UI action model (generated MCP tools)",
  browser: "Browser driving (Playwright, accessibility tree)",
  bridge: "UI-SDK-style bridge on the screen",
  "plain-mcp": "Plain hand-written MCP tools",
};
const ARM_ORDER = Object.keys(ARM_NAMES);

/** The apps tasks run in, as the page names them. A run from before apps were recorded ran in Pantry. */
const APP_TEXT = {
  pantry: { name: "Pantry", what: "Pantry, a made-up kitchen shaped like Spoonjoy's shopping list and recipes, with its actions declared for the benchmark" },
  "ouro-md": { name: "Ouro MD", what: "Ouro MD, a made-up folder of Markdown documents behind Ouro MD's own action declarations, whose generated tools are byte for byte the ones Ouro MD ships" },
};
const APP_ORDER = Object.keys(APP_TEXT);
const appOfTask = (task) => task.app ?? "pantry";

/** Every published run, oldest first: `results/<folder>/results.json`, without the oracle's. */
export function publishedRuns(dir = RESULTS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .map((folder) => ({ folder, file: path.join(dir, folder, "results.json") }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ folder, file }) => ({ folder, ...JSON.parse(fs.readFileSync(file, "utf8")) }));
}

const pct = (successes, trials) => `${successes} of ${trials} (${Math.round((100 * successes) / trials)}%)`;
const num = (s, digits = 1) => (s ? `${s.mean.toFixed(digits)} ± ${s.sd.toFixed(digits)}` : "n/a");
const int = (s) => (s ? `${Math.round(s.mean).toLocaleString("en-US")} ± ${Math.round(s.sd).toLocaleString("en-US")}` : "n/a");
const aiu = (s) => (s ? s.mean.toFixed(3) : "n/a");
const armName = (id) => ARM_NAMES[id] ?? id;
const byArmOrder = (a, b) => ARM_ORDER.indexOf(a.arm) - ARM_ORDER.indexOf(b.arm);

function armTable(rows) {
  const lines = [
    "| Interface | Tasks done (checked) | Steps | Time (s) | Tokens | Cost per trial (AI units) | Order left to the person |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of [...rows].sort(byArmOrder)) {
    lines.push(`| ${armName(row.arm)} | ${pct(row.successes, row.trials)} | ${num(row.steps)} | ${num(row.wallSeconds)} | ${int(row.tokens)} | ${aiu(row.costAiu)} | ${row.personOnly.trials ? `${row.personOnly.refused} of ${row.personOnly.trials}` : "n/a"} |`);
  }
  return lines.join("\n");
}

function taskTable(cells, tasks, apps) {
  const arms = [...new Set(cells.map((c) => c.arm))].sort((a, b) => ARM_ORDER.indexOf(a) - ARM_ORDER.indexOf(b));
  const lines = [`| Task | ${arms.map(armName).join(" | ")} |`, `| --- | ${arms.map(() => "---").join(" | ")} |`];
  for (const task of tasks) {
    const row = arms.map((arm) => {
      const cell = cells.filter((c) => c.arm === arm && c.task === task.id);
      const trials = cell.reduce((a, c) => a + c.trials, 0);
      const successes = cell.reduce((a, c) => a + c.successes, 0);
      return trials ? `${successes}/${trials}` : "n/a";
    });
    const where = apps.length > 1 ? `${APP_TEXT[appOfTask(task)]?.name ?? appOfTask(task)}: ` : "";
    lines.push(`| ${where}${task.personOnly ? "Refuse: " : ""}"${task.prompt}" | ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

/**
 * The trials the page counts: for each model, interface and task, those of the latest run that has them. A later run
 * of the same model, interface and task (after a harness fix, say) supersedes the earlier one, which stays published;
 * a run of new tasks adds to the earlier runs rather than replacing them.
 */
export function currentTrials(modelRuns) {
  const key = (trial) => `${trial.model}\u0000${trial.arm}\u0000${trial.task}`;
  const latest = new Map();
  for (const run of modelRuns) for (const trial of run.trials) latest.set(key(trial), run.folder);
  return modelRuns.flatMap((run) => run.trials.filter((trial) => latest.get(key(trial)) === run.folder));
}

/** The page, from `runs` (publishedRuns()). */
export function renderPage(runs) {
  if (!runs.length) throw new Error("No published run in scripts/agent-benchmark/results/. Run the benchmark and copy a run there first.");
  for (const run of runs) if (run.invalid) throw new Error(`${run.folder} is invalid: ${run.invalid}. Remove it from results/.`);
  const modelRuns = runs.filter((run) => !run.models.every((m) => m.provider === "oracle")).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const trials = currentTrials(modelRuns);
  const counted = new Set(trials);
  const runsUsed = modelRuns.filter((run) => run.trials.some((trial) => counted.has(trial)));
  const superseded = modelRuns.filter((run) => run.trials.some((trial) => !counted.has(trial)));
  const pooled = summarize(trials.map((t) => ({ ...t, model: "all" })));
  const tasks = [...new Map(modelRuns.flatMap((run) => run.tasks).map((task) => [task.id, task])).values()].sort((a, b) => APP_ORDER.indexOf(appOfTask(a)) - APP_ORDER.indexOf(appOfTask(b)));
  const appOf = new Map(tasks.map((task) => [task.id, appOfTask(task)]));
  const apps = APP_ORDER.filter((id) => trials.some((t) => appOf.get(t.task) === id));
  const models = [...new Map(modelRuns.flatMap((run) => run.models).map((m) => [m.provider, m])).values()].filter((m) => trials.some((t) => t.model === m.provider));
  const dates = [...new Set(runsUsed.map((run) => run.startedAt.slice(0, 10)))];
  const out = [];
  out.push("# Agent interfaces against the screen");
  out.push("");
  out.push(
    apps.length > 1
      ? `The same tasks, the same models and the same made-up apps, reached four ways: through Ouro UI's action model, by driving the browser, through a bridge on the screen, and through a plain hand-written MCP server. The apps are ${apps.map((id) => APP_TEXT[id].what).join("; and ")}. Across ${trials.length} checked trials by ${models.length} model${models.length === 1 ? "" : "s"}:`
      : `The same tasks, the same models and the same made-up kitchen, reached four ways: through Ouro UI's action model, by driving the browser, through a bridge on the screen, and through a plain hand-written MCP server. Across ${trials.length} checked trials by ${models.length} model${models.length === 1 ? "" : "s"}:`,
  );
  out.push("");
  for (const row of [...pooled.arms].sort(byArmOrder)) out.push(`- ${armName(row.arm)}: ${pct(row.successes, row.trials)} done, in ${row.steps.mean.toFixed(1)} steps and ${int(row.tokens).split(" ")[0]} tokens on average.`);
  out.push("");
  out.push(`A trial counts as done only when a script finds ${apps.length > 1 ? "the app" : "the kitchen"} in the state the person asked for. The model's own account of what it did is recorded and never scored. Every number on this page is computed from the runs' results files; none is written by hand.`);
  out.push("");
  const ordered = pooled.arms.filter((row) => row.personOnly.trials).sort(byArmOrder);
  out.push("One task asks the model to order the groceries and pay. Paying is marked as the person's to do, so the right result is no order and a reply that hands it back. Trials that placed the order anyway:");
  out.push("");
  for (const row of ordered) out.push(`- ${armName(row.arm)}: ${row.personOnly.done} of ${row.personOnly.trials}.`);
  out.push("");
  out.push("The action model and the bridge enforce the mark themselves. Through browser driving and the plain server, only the model can decline.");
  out.push("");
  out.push("## All models together");
  out.push("");
  out.push("Mean ± standard deviation per trial. Steps are tool calls. Cost is GitHub Copilot AI units as the runtime reported them; a model reached through its own API, which the Copilot catalog does not price, has none (n/a).");
  out.push("");
  out.push(armTable(pooled.arms));
  out.push("");
  out.push("## Each task");
  out.push("");
  out.push("Trials done, out of trials run, across every model.");
  out.push("");
  out.push(taskTable(pooled.cells, tasks, apps));
  if (apps.length > 1) {
    out.push("");
    out.push("## Each app");
    for (const id of apps) {
      out.push("");
      out.push(`### ${APP_TEXT[id].name}`);
      out.push("");
      out.push(armTable(summarize(trials.filter((t) => appOf.get(t.task) === id).map((t) => ({ ...t, model: "all" }))).arms));
    }
  }
  out.push("");
  out.push("## Each model");
  for (const model of models) {
    const rows = summarize(trials.filter((t) => t.model === model.provider)).arms;
    if (!rows.length) continue;
    out.push("");
    out.push(`### ${model.displayName}`);
    out.push("");
    out.push(armTable(rows));
  }
  out.push("");
  out.push("## How it was run");
  out.push("");
  out.push(`- Interfaces${apps.length > 1 ? ", in Pantry" : ""}: The action model's tools are generated by \`ouro-actions\` from one \`defineAction\` per action; ordering and paying is person-only, so it is not a tool. Browser driving gets Playwright's accessibility snapshot with refs, and click, type and select. The bridge, shaped like Vercel UI SDK's \`createAgent\`, lists the screen's controls and acts on them, and refuses the control marked as the person's. The plain server has CRUD tools written apart from the screen, with no consent classes.`);
  if (apps.includes("ouro-md")) out.push(`- Ouro MD: The action model's tools are the ones Ouro MD's generator writes from its own declarations, the same bytes Ouro MD ships; replacing a document is consequential, so that tool asks before it overwrites. The plain server is shaped like the reference MCP filesystem server: list a folder, read, write and edit a file, with no append and no confirmation.`);
  out.push(apps.length > 1 ? `- Same for every interface: One system prompt per app, the same task words, a fresh copy of the same made-up app per trial, and the GitHub Copilot runtime with nothing but the interface's tools.` : `- Same for every interface: One system prompt, the same task words, a fresh copy of the same made-up kitchen per trial, and the GitHub Copilot runtime with nothing but the interface's tools.`);
  out.push(`- Models: ${models.map((m) => m.displayName).join(", ")}.`);
  out.push(`- Runs counted: ${runsUsed.map((run) => `${run.startedAt.slice(0, 10)} \`${run.folder}\`, ${run.trialsPerCell} trials per model, interface and task ([results](${REPO}/blob/main/scripts/agent-benchmark/results/${run.folder}/results.json))`).join("; ")}. For each model, interface and task the page counts the latest run that has them.`);
  const missing = models
    .map((model) => ({ model, apps: apps.filter((id) => !trials.some((t) => t.model === model.provider && appOf.get(t.task) === id)) }))
    .filter(({ apps: gaps }) => gaps.length && apps.length > 1);
  if (missing.length) out.push(`- Not run: ${missing.map(({ model, apps: gaps }) => `${model.displayName} on ${gaps.map((id) => `${APP_TEXT[id].name}'s tasks`).join(" and ")}`).join("; ")}.`);
  if (superseded.length) out.push(`- Superseded, still published: ${superseded.map((run) => `\`${run.folder}\` ([results](${REPO}/blob/main/scripts/agent-benchmark/results/${run.folder}/results.json))`).join("; ")}: a later run of the same model and interface replaced some or all of its trials; the methodology says why.`);
  out.push(`- Cost: ${(trials.reduce((a, t) => a + (t.costAiu ?? 0), 0)).toFixed(1)} AI units across the trials counted. A model reached through its own API, whose price the Copilot catalog lacks, has no cost recorded.`);
  out.push(`- Every interface can do every task: A scripted agent does each task through each interface's own tools, in the tests.`);
  out.push("");
  out.push(`The protocol, its limits and the prior art it borrows from (WebArena, OSWorld, AndroidWorld, the CLI-against-GUI study and Vercel UI SDK's benchmark) are in the [methodology](${REPO}/blob/main/scripts/agent-benchmark/METHODOLOGY.md). Every trial's transcript is beside its results file. Measured ${dates.join(" and ")}.`);
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [target, results] = process.argv.slice(2);
  if (!target) {
    console.error("Usage: node scripts/agent-benchmark/page.mjs <out.md> [<results folder, default scripts/agent-benchmark/results>]");
    process.exitCode = 2;
  } else {
    fs.writeFileSync(target, renderPage(publishedRuns(results ? path.resolve(results) : RESULTS_DIR)));
    console.log(`Wrote ${target}`);
  }
}
