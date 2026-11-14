// Renders the site's agent interface page (docs/guides/agent-interfaces.md, served at /docs/agent-interfaces/) from
// the published runs' results.json files. Every number on the page comes from them; nothing is written by hand.
// pnpm claims:check renders it again and fails when the committed page differs.
//
//   node scripts/agent-benchmark/page.mjs docs/guides/agent-interfaces.md
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
    "| Interface | Tasks done (checked) | Steps | Time (s) | Tokens | Cost per trial (AI units) | Person-only action refused |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of [...rows].sort(byArmOrder)) {
    lines.push(`| ${armName(row.arm)} | ${pct(row.successes, row.trials)} | ${num(row.steps)} | ${num(row.wallSeconds)} | ${int(row.tokens)} | ${aiu(row.costAiu)} | ${row.personOnly.trials ? `${row.personOnly.refused} of ${row.personOnly.trials}` : "n/a"} |`);
  }
  return lines.join("\n");
}

function taskTable(cells, tasks) {
  const arms = [...new Set(cells.map((c) => c.arm))].sort((a, b) => ARM_ORDER.indexOf(a) - ARM_ORDER.indexOf(b));
  const lines = [`| Task | ${arms.map(armName).join(" | ")} |`, `| --- | ${arms.map(() => "---").join(" | ")} |`];
  for (const task of tasks) {
    const row = arms.map((arm) => {
      const cell = cells.filter((c) => c.arm === arm && c.task === task.id);
      const trials = cell.reduce((a, c) => a + c.trials, 0);
      const successes = cell.reduce((a, c) => a + c.successes, 0);
      return trials ? `${successes}/${trials}` : "n/a";
    });
    lines.push(`| ${task.personOnly ? "Refuse: " : ""}"${task.prompt}" | ${row.join(" | ")} |`);
  }
  return lines.join("\n");
}

/** The page, from `runs` (publishedRuns()). */
export function renderPage(runs) {
  if (!runs.length) throw new Error("No published run in scripts/agent-benchmark/results/. Run the benchmark and copy a run there first.");
  const modelRuns = runs.filter((run) => !run.models.every((m) => m.provider === "oracle"));
  const trials = modelRuns.flatMap((run) => run.trials);
  const pooled = summarize(trials.map((t) => ({ ...t, model: "all" })));
  const tasks = modelRuns.at(-1).tasks;
  const models = [...new Map(modelRuns.flatMap((run) => run.models).map((m) => [m.provider, m])).values()];
  const dates = [...new Set(modelRuns.map((run) => run.startedAt.slice(0, 10)))];
  const best = [...pooled.arms].sort((a, b) => b.successRate - a.successRate || a.steps.mean - b.steps.mean)[0];
  const browserRow = pooled.arms.find((row) => row.arm === "browser");
  const actionRow = pooled.arms.find((row) => row.arm === "action-model");
  const out = [];
  out.push("# Agent interfaces against the screen");
  out.push("");
  out.push(
    `The same task, the same model and the same made-up kitchen, reached four ways: through Ouro UI's action model, by driving the browser, through a bridge on the screen, and through a plain hand-written MCP server. Across ${trials.length} checked trials by ${models.length} model${models.length === 1 ? "" : "s"}, ${armName(best.arm).toLowerCase()} did the most tasks${actionRow && browserRow ? `: the action model ${pct(actionRow.successes, actionRow.trials)} in ${actionRow.steps.mean.toFixed(1)} steps on average, browser driving ${pct(browserRow.successes, browserRow.trials)} in ${browserRow.steps.mean.toFixed(1)}` : ""}.`,
  );
  out.push("");
  out.push("A trial counts as done only when a script finds the kitchen in the state the person asked for. The model's own account of what it did is recorded and never scored. Every number on this page is computed from the runs' results files; none is written by hand.");
  out.push("");
  out.push("## All models together");
  out.push("");
  out.push("Mean ± standard deviation per trial. Steps are tool calls. Cost is GitHub Copilot AI units as the runtime reported them, or the catalog's token prices for a model reached through its own API.");
  out.push("");
  out.push(armTable(pooled.arms));
  out.push("");
  out.push("## Each task");
  out.push("");
  out.push("Trials done, out of trials run, across every model.");
  out.push("");
  out.push(taskTable(pooled.cells, tasks));
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
  out.push(`- **Interfaces.** The action model's tools are generated by \`ouro-actions\` from one \`defineAction\` per action; ordering and paying is person-only, so it is not a tool. Browser driving gets Playwright's accessibility snapshot with refs, and click, type and select. The bridge, shaped like Vercel UI SDK's \`createAgent\`, lists the screen's controls and acts on them, and refuses the control marked as the person's. The plain server has CRUD tools written apart from the screen, with no consent classes.`);
  out.push(`- **Same for every interface.** One system prompt, the same task words, a fresh copy of the same made-up kitchen per trial, and the GitHub Copilot runtime with nothing but the interface's tools.`);
  out.push(`- **Models.** ${models.map((m) => m.displayName).join(", ")}.`);
  out.push(`- **Runs.** ${modelRuns.map((run) => `${run.startedAt.slice(0, 10)}, ${run.trialsPerCell} trials per model, interface and task ([results](${REPO}/blob/main/scripts/agent-benchmark/results/${run.folder}/results.json))`).join("; ")}.`);
  out.push(`- **Every interface can do every task.** A scripted agent does each task through each interface's own tools, in the tests.`);
  out.push("");
  out.push(`The protocol, its limits and the prior art it borrows from (WebArena, OSWorld, AndroidWorld, the CLI-against-GUI study and Vercel UI SDK's benchmark) are in the [methodology](${REPO}/blob/main/scripts/agent-benchmark/METHODOLOGY.md). Every trial's transcript is beside its results file. Measured ${dates.join(" and ")}.`);
  out.push("");
  return out.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node scripts/agent-benchmark/page.mjs <out.md>");
    process.exitCode = 2;
  } else {
    fs.writeFileSync(target, renderPage(publishedRuns()));
    console.log(`Wrote ${target}`);
  }
}
