import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arms } from "./prompt.mts";
import { score, summary } from "./score.mts";
import { screens } from "./screens.mts";
import { resultsTable } from "./table.mts";

//   node scripts/agent-usability/score-runs.mts [<date>]
//
// Scores every committed agent output in runs/<date>/<arm>/<screen>/ (default: the newest
// date) and prints the results table and each screen's summary as markdown, for the
// workflow's job summary. Low scores are results, not failures: it exits 0 unless the
// scorer itself breaks.

const runs = join(dirname(fileURLToPath(import.meta.url)), "runs");

const dates = existsSync(runs) ? readdirSync(runs).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name)).sort() : [];
const date = process.argv[2] || dates.at(-1);

if (!date) {
  process.stdout.write("# Agent usability\n\nNo agent output is committed under scripts/agent-usability/runs/ yet, so there is nothing to score. The README says how to add a run.\n");
  process.exit(0);
}
const dir = join(runs, date);
if (!existsSync(dir)) {
  console.error(`No run folder ${dir}`);
  process.exit(1);
}

const sections: string[] = [];
for (const arm of arms) {
  for (const screen of screens) {
    const app = join(dir, arm, screen);
    if (!existsSync(join(app, "package.json"))) continue;
    console.error(`[score-runs] ${arm} ${screen}`);
    const result = await score({ arm, screen, dir: app, log: (line) => console.error(`[score] ${arm} ${screen}: ${line}`) });
    sections.push(summary(result, `runs/${date}/${arm}/${screen}/score`));
  }
}

const note = existsSync(join(dir, "run.md")) ? `${readFileSync(join(dir, "run.md"), "utf8").trim()}\n\n` : "";
process.stdout.write(`# Agent usability, ${date}\n\n${note}${resultsTable(dir)}\n${sections.join("\n")}`);
