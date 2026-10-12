import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPoints, formulaVersion, type Points } from "./formula.mts";
import { armNames, arms } from "./prompt.mts";
import { screens } from "./screens.mts";

//   node scripts/agent-usability/table.mts <runs/<date>> [--write]
//
// The results table the docs page shows: one row per screen, one column per arm, read from
// <arm>/<screen>/score/score.json under the folder. --write also saves it as results.md there.

interface Scored {
  formulaVersion: number;
  points: Points;
}

function read(root: string, arm: string, screen: string): Scored | undefined {
  const path = join(root, arm, screen, "score", "score.json");
  if (!existsSync(path)) return undefined;
  const scored: Scored = JSON.parse(readFileSync(path, "utf8"));
  if (scored.formulaVersion !== formulaVersion) {
    throw new Error(`${path} was scored with formula ${scored.formulaVersion}, not ${formulaVersion}: score it again with score.mts`);
  }
  return scored;
}

const mean = (values: number[]) => (values.length === 0 ? "not run" : formatPoints(values.reduce((sum, value) => sum + value, 0) / values.length));

export function resultsTable(root: string): string {
  const scores = arms.map((arm) => screens.map((screen) => read(root, arm, screen)));
  const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const parts = ["typecheck", "lint", "axe", "behavior"] as const;
  return [
    row(["Screen", ...arms.map((arm) => armNames[arm])]),
    row(["---", ...arms.map(() => "---:")]),
    ...screens.map((screen, index) => row([screen, ...scores.map((column) => (column[index] ? formatPoints(column[index].points.score) : "not run"))])),
    row(["Mean of the screens run", ...scores.map((column) => mean(column.flatMap((scored) => (scored ? [scored.points.score] : []))))]),
    "",
    "Mean points per part, out of typecheck 20, lint 10, axe 20 and behavior 50 (formula: scripts/agent-usability/formula.mts):",
    "",
    row(["Arm", "Typecheck", "Lint", "Axe", "Behavior"]),
    row(["---", "---:", "---:", "---:", "---:"]),
    ...arms.map((arm, index) =>
      row([armNames[arm], ...parts.map((part) => mean(scores[index]!.flatMap((scored) => (scored ? [scored.points[part]] : []))))]),
    ),
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, flag] = process.argv.slice(2);
  if (!dir || (flag && flag !== "--write")) {
    console.error("usage: table.mts <runs/<date>> [--write]");
    process.exit(1);
  }
  const table = resultsTable(resolve(dir));
  if (flag) writeFileSync(join(resolve(dir), "results.md"), table);
  process.stdout.write(table);
}
