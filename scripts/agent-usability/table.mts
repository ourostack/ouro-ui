import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPoints, formulaVersion, median, parts, runsPerCell, weights, type Points } from "./formula.mts";
import { armNames, arms, type Arm } from "./prompt.mts";
import { screens } from "./screens.mts";
import { readArmRecord, type ArmRecord } from "./workspace.mts";

//   node scripts/agent-usability/table.mts <runs/<date>> [--write]
//
// The results the docs page shows, read from <arm>/<screen>/<run>/score/score.json under the
// folder: every run's score and the median per arm and screen, then what produced them (the
// agent, from run.md, and each arm's pinned versions and baseline, from arms/<arm>.json).
// --write also saves it as results.md there. It fails when run.md does not name the model, or
// when an arm with runs has no record, because a table nobody can trace is worth nothing.

interface Scored {
  formulaVersion: number;
  points: Points;
  versions?: { harness: string | null; axeCore: string; chromium: string | null };
}

/** The run folders of one arm and screen, in order: 1, 2, 3. */
export function runFolders(root: string, arm: string, screen: string): string[] {
  const dir = join(root, arm, screen);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^[1-9]\d*$/.test(name))
    .sort((a, b) => Number(a) - Number(b))
    .map((name) => join(dir, name));
}

function read(root: string, arm: string, screen: string): Scored[] {
  return runFolders(root, arm, screen).flatMap((folder) => {
    const path = join(folder, "score", "score.json");
    if (!existsSync(path)) return [];
    const scored: Scored = JSON.parse(readFileSync(path, "utf8"));
    if (scored.formulaVersion !== formulaVersion) {
      throw new Error(`${path} was scored with formula ${scored.formulaVersion}, not ${formulaVersion}: score it again with score.mts`);
    }
    return [scored];
  });
}

const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const short = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : "none");
const unique = (values: (string | null | undefined)[]) => [...new Set(values.map((value) => value ?? "unknown"))].join(", ") || "unknown";

/** One cell: every run's score, then the median, or how many of the runs exist. */
function cell(runs: Scored[]): string {
  if (runs.length === 0) return "not run";
  const scores = runs.map((scored) => scored.points.score);
  const listed = scores.map(formatPoints).join(", ");
  return runs.length < runsPerCell ? `${listed} (${runs.length} of ${runsPerCell} runs)` : `${listed} (median ${formatPoints(median(scores))})`;
}

/** What run.md must say about the agents. The README has the template. */
function runNotes(root: string): string {
  const path = join(root, "run.md");
  if (!existsSync(path)) throw new Error(`${path} is missing: it names the model, the effort and the command every agent was started with`);
  const text = readFileSync(path, "utf8").trim();
  for (const field of ["Model", "Effort", "Agent"]) {
    if (!new RegExp(`^- ${field}: \\S`, "m").test(text)) throw new Error(`${path} has no "- ${field}: ..." line`);
  }
  return text;
}

function versions(root: string, ran: Arm[], all: Scored[]): string[] {
  const records = new Map<Arm, ArmRecord>(ran.map((arm) => [arm, readArmRecord(join(root, "arms", `${arm}.json`))]));
  const each = (value: (record: ArmRecord) => string) => ran.map((arm) => value(records.get(arm)!));
  const packages = [...new Set(ran.flatMap((arm) => Object.keys(records.get(arm)!.packages ?? {})))];
  return [
    row(["Pinned", ...ran.map((arm) => armNames[arm])]),
    row(["---", ...ran.map(() => "---")]),
    row(["Arm made", ...each((record) => record.createdAt?.slice(0, 10) ?? "unknown")]),
    row(["shadcn CLI", ...each((record) => record.shadcnCli ?? "unknown")]),
    row(["Ouro HX release", ...each((record) => record.ouroRef ?? "none")]),
    row(["Skill", ...each((record) => (record.skill ? `shadcn-ui/ui@${short(record.skill.lock.skills.shadcn?.ref)}, content ${short(record.skill.lock.skills.shadcn?.computedHash)}` : "none"))]),
    row(["llms.txt (sha256)", ...each((record) => short(record.llmsTxt?.sha256))]),
    row(["Installed files (count)", ...each((record) => String(Object.keys(record.files).length))]),
    ...packages.map((name) => row([name, ...each((record) => record.packages?.[name] ?? "none")])),
    row(["Type errors before the agent ran", ...each((record) => String(record.baseline.typecheck.length))]),
    row(["Lint errors before the agent ran", ...each((record) => String(record.baseline.lint.length))]),
    "",
    `Scored by harness commit ${unique(all.map((scored) => scored.versions?.harness && short(scored.versions.harness)))}, axe-core ${unique(all.map((scored) => scored.versions?.axeCore))}, Chromium ${unique(all.map((scored) => scored.versions?.chromium))}, formula ${formulaVersion} (scripts/agent-usability/formula.mts).`,
  ];
}

export function resultsTable(root: string): string {
  const notes = runNotes(root);
  const scores = arms.map((arm) => screens.map((screen) => read(root, arm, screen)));
  const ran = arms.filter((_, index) => scores[index]!.some((runs) => runs.length > 0));
  const complete = scores.every((column) => column.every((runs) => runs.length === runsPerCell));
  const lines = [
    notes,
    "",
    `Each cell lists the score of each of the ${runsPerCell} runs, out of 100, and their median.`,
    "",
    row(["Screen", ...arms.map((arm) => armNames[arm])]),
    row(["---", ...arms.map(() => "---")]),
    ...screens.map((screen, index) => row([screen, ...scores.map((column) => cell(column[index]!))])),
  ];
  if (complete) {
    lines.push(
      row(["Mean of the five medians", ...scores.map((column) => formatPoints(mean(column.map((runs) => median(runs.map((scored) => scored.points.score))))))]),
      "",
      `Mean points per part over all ${runsPerCell * screens.length} runs of an arm:`,
      "",
      row(["Arm", ...parts.map((part) => `${part} (of ${weights[part]})`)]),
      row(["---", ...parts.map(() => "---:")]),
      ...arms.map((arm, index) => row([armNames[arm], ...parts.map((part) => formatPoints(mean(scores[index]!.flat().map((scored) => scored.points[part]))))])),
    );
  } else {
    lines.push("", `No means are shown, because not every arm has ${runsPerCell} scored runs of every screen.`);
  }
  if (ran.length > 0) lines.push("", ...versions(root, ran, scores.flat(2)));
  return `${lines.join("\n")}\n`;
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
