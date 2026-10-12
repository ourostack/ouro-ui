import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arms } from "./prompt.mts";
import { score, summary } from "./score.mts";
import { screens } from "./screens.mts";
import { resultsTable, runFolders } from "./table.mts";

//   node scripts/agent-usability/score-runs.mts [<date>]
//
// Scores every committed agent output in runs/<date>/<arm>/<screen>/<run>/ (default: the
// newest date) against the arm's record in runs/<date>/arms/<arm>.json, and prints the results
// table and each run's summary as markdown, for the workflow's job summary. Low scores are
// results, not failures. A run the scorer can't score is reported and the rest still run, and
// then it exits 1, as it does when the table can't be made.

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
const broken: string[] = [];
for (const arm of arms) {
  for (const screen of screens) {
    for (const app of runFolders(dir, arm, screen)) {
      const name = `${arm} ${screen} run ${basename(app)}`;
      console.error(`[score-runs] ${name}`);
      try {
        const result = await score({ arm, screen, dir: app, record: join(dir, "arms", `${arm}.json`), log: (line) => console.error(`[score] ${name}: ${line}`) });
        sections.push(summary(result, `runs/${date}/${arm}/${screen}/${basename(app)}/score`).replace(/^## (.*?):/, `## $1, run ${basename(app)}:`));
      } catch (error) {
        broken.push(`- ${name}: ${String((error as Error).message ?? error).split("\n")[0]}`);
        console.error(error);
      }
    }
  }
}

process.stdout.write(`# Agent usability, ${date}\n\n`);
if (broken.length > 0) process.stdout.write(`**The scorer could not score ${broken.length} of the runs.** Their scores below, if any, are from an earlier scoring.\n\n${broken.join("\n")}\n\n`);
process.stdout.write(`${resultsTable(dir)}\n${sections.join("\n")}`);
if (broken.length > 0) process.exitCode = 1;
